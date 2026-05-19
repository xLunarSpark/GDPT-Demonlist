import {
    createGitHubContentClient,
    jsonResponse,
    requireAdmin,
} from '../_shared.js';

const LIST_FILE = 'data/_list.json';
const BUNDLED_FILE = 'data/_list_bundled.json';
const PENDING_FILE = 'data/_pending_placements.json';
const MAX_GITHUB_WRITE_RETRIES = 2;

function safeParseArray(text) {
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function isShaConflict(error) {
    const msg = String(error?.message ?? error);
    return msg.includes(' failed: 409') && msg.includes('sha is at');
}

function isNotFound(error) {
    const msg = String(error?.message ?? error);
    return msg.includes(' failed: 404');
}

async function addPendingPlacement(github, fileId, initialFile = null) {
    let pendingFile = initialFile;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_GITHUB_WRITE_RETRIES; attempt += 1) {
        if (!pendingFile) {
            pendingFile = await github.getFile(PENDING_FILE);
        }

        const pendingValues = pendingFile
            ? safeParseArray(pendingFile.content)
            : [];

        const values = pendingValues
            .filter((x) => typeof x === 'string')
            .map((x) => x.trim())
            .filter(Boolean);

        if (values.includes(fileId)) {
            return false;
        }

        values.push(fileId);

        try {
            await github.putFile(
                PENDING_FILE,
                JSON.stringify(values, null, 4),
                `Admin Panel: Mark ${fileId} as pending placement`,
                pendingFile?.sha ?? null,
            );
            return true;
        } catch (e) {
            lastError = e;
            if (!isShaConflict(e) || attempt === MAX_GITHUB_WRITE_RETRIES - 1) {
                throw e;
            }

            pendingFile = null;
        }
    }

    throw lastError;
}

async function removePendingPlacement(github, fileId, initialFile = null) {
    let pendingFile = initialFile;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_GITHUB_WRITE_RETRIES; attempt += 1) {
        if (!pendingFile) {
            pendingFile = await github.getFile(PENDING_FILE);
        }

        if (!pendingFile) {
            return false;
        }

        const pendingValues = safeParseArray(pendingFile.content)
            .filter((x) => typeof x === 'string')
            .map((x) => x.trim())
            .filter(Boolean);

        const nextValues = pendingValues.filter((slug) => slug !== fileId);
        if (nextValues.length === pendingValues.length) {
            return false;
        }

        try {
            await github.putFile(
                PENDING_FILE,
                JSON.stringify(nextValues, null, 4),
                `Admin Panel: Remove ${fileId} from pending placements`,
                pendingFile.sha,
            );
            return true;
        } catch (e) {
            lastError = e;
            if (!isShaConflict(e) || attempt === MAX_GITHUB_WRITE_RETRIES - 1) {
                throw e;
            }

            pendingFile = null;
        }
    }

    throw lastError;
}

async function updateListForMove(github, fileId, targetPosition, initialFile = null) {
    let listFile = initialFile;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_GITHUB_WRITE_RETRIES; attempt += 1) {
        if (!listFile) {
            listFile = await github.getFile(LIST_FILE);
        }

        if (!listFile) {
            throw new Error('List file not found');
        }

        const parsedList = safeParseArray(listFile.content);
        let listArray = parsedList.filter((x) => typeof x === 'string');
        const oldIndex = listArray.indexOf(fileId);

        listArray = listArray.filter((x) => x !== fileId);
        const insertIndex = clamp(targetPosition - 1, 0, listArray.length);
        listArray.splice(insertIndex, 0, fileId);

        try {
            await github.putFile(
                LIST_FILE,
                JSON.stringify(listArray, null, 4),
                `Admin Panel: Move ${fileId} to #${targetPosition}`,
                listFile.sha,
            );

            return { oldIndex, insertIndex };
        } catch (e) {
            lastError = e;
            if (!isShaConflict(e) || attempt === MAX_GITHUB_WRITE_RETRIES - 1) {
                throw e;
            }

            listFile = null;
        }
    }

    throw lastError;
}

async function updateListForDelete(github, fileId, initialFile = null) {
    let listFile = initialFile;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_GITHUB_WRITE_RETRIES; attempt += 1) {
        if (!listFile) {
            listFile = await github.getFile(LIST_FILE);
        }

        if (!listFile) {
            throw new Error('List file not found');
        }

        const parsedList = safeParseArray(listFile.content);
        const listArray = parsedList.filter((x) => typeof x === 'string');

        const oldIndex = listArray.indexOf(fileId);
        const newArray = listArray.filter((x) => x !== fileId);

        if (newArray.length === listArray.length) {
            return { oldIndex, changed: false };
        }

        try {
            await github.putFile(
                LIST_FILE,
                JSON.stringify(newArray, null, 4),
                `Admin Panel: Remove ${fileId} from list`,
                listFile.sha,
            );

            return { oldIndex, changed: true };
        } catch (e) {
            lastError = e;
            if (!isShaConflict(e) || attempt === MAX_GITHUB_WRITE_RETRIES - 1) {
                throw e;
            }

            listFile = null;
        }
    }

    throw lastError;
}

async function updateBundledForMove(github, fileId, demonData, insertIndex, oldIndex, initialFile = null) {
    let bundledFile = initialFile;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_GITHUB_WRITE_RETRIES; attempt += 1) {
        if (!bundledFile) {
            bundledFile = await github.getFile(BUNDLED_FILE);
        }

        if (!bundledFile) {
            return false;
        }

        const bundledArray = safeParseArray(bundledFile.content);
        const safeInsertIndex = clamp(insertIndex, 0, bundledArray.length);

        let removeIndex = -1;
        const demonId = demonData?.id;
        const demonName = demonData?.name;
        removeIndex = bundledArray.findIndex((x) => x?.id === demonId || x?.name === demonName);

        if (removeIndex === -1 && oldIndex !== -1 && oldIndex < bundledArray.length) {
            const candidate = bundledArray[oldIndex];
            if (candidate?.id === demonId || candidate?.name === demonName) {
                removeIndex = oldIndex;
            }
        }

        if (removeIndex !== -1) {
            bundledArray.splice(removeIndex, 1);
        }

        bundledArray.splice(safeInsertIndex, 0, demonData);

        try {
            await github.putFile(
                BUNDLED_FILE,
                JSON.stringify(bundledArray),
                `Admin Panel: Update bundled data for ${fileId}`,
                bundledFile.sha,
            );

            return true;
        } catch (e) {
            lastError = e;
            if (!isShaConflict(e) || attempt === MAX_GITHUB_WRITE_RETRIES - 1) {
                throw e;
            }

            bundledFile = null;
        }
    }

    throw lastError;
}

async function updateBundledForDelete(github, fileId, demonDataForFallback, oldIndex, initialFile = null) {
    let bundledFile = initialFile;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_GITHUB_WRITE_RETRIES; attempt += 1) {
        if (!bundledFile) {
            bundledFile = await github.getFile(BUNDLED_FILE);
        }

        if (!bundledFile) {
            return false;
        }

        const bundledArray = safeParseArray(bundledFile.content);

        let removeIndex = -1;
        if (demonDataForFallback) {
            const demonId = demonDataForFallback?.id;
            const demonName = demonDataForFallback?.name;
            removeIndex = bundledArray.findIndex((x) => x?.id === demonId || x?.name === demonName);
        }

        if (removeIndex === -1) {
            const slugName = String(fileId).replace(/_/g, ' ').toLowerCase();
            removeIndex = bundledArray.findIndex((x) => String(x?.name ?? '').toLowerCase() === slugName);
        }

        if (removeIndex === -1 && oldIndex !== -1 && oldIndex < bundledArray.length) {
            const candidateSlug = String(bundledArray[oldIndex]?.name ?? '').replace(/ /g, '_').toLowerCase();
            if (candidateSlug === String(fileId).toLowerCase()) {
                removeIndex = oldIndex;
            }
        }

        if (removeIndex === -1) {
            return false;
        }

        bundledArray.splice(removeIndex, 1);

        try {
            await github.putFile(
                BUNDLED_FILE,
                JSON.stringify(bundledArray),
                `Admin Panel: Remove ${fileId} from bundled list`,
                bundledFile.sha,
            );

            return true;
        } catch (e) {
            lastError = e;
            if (!isShaConflict(e) || attempt === MAX_GITHUB_WRITE_RETRIES - 1) {
                throw e;
            }

            bundledFile = null;
        }
    }

    throw lastError;
}

async function deleteDemonFile(github, filename, fileId, initialFile = null) {
    let demonFile = initialFile;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_GITHUB_WRITE_RETRIES; attempt += 1) {
        if (!demonFile) {
            demonFile = await github.getFile(filename);
        }

        if (!demonFile) {
            return false;
        }

        try {
            await github.deleteFile(filename, `Admin Panel: Delete ${fileId}`, demonFile.sha);
            return true;
        } catch (e) {
            if (isNotFound(e)) {
                return false;
            }

            lastError = e;
            if (!isShaConflict(e) || attempt === MAX_GITHUB_WRITE_RETRIES - 1) {
                throw e;
            }

            demonFile = null;
        }
    }

    throw lastError;
}

export async function onRequest(context) {
    const { request, env } = context;

    const { response } = requireAdmin(request, env);
    if (response) {
        return response;
    }

    let github;
    try {
        github = createGitHubContentClient(env);
    } catch (e) {
        return jsonResponse({ error: String(e?.message ?? e) }, { status: 500 });
    }

    if (request.method === 'POST') {
        let reqData;
        try {
            reqData = await request.json();
        } catch {
            return jsonResponse({ error: 'Invalid JSON' }, { status: 400 });
        }

        const fileId = String(reqData?.id ?? '').trim();
        const demonData = reqData?.demonData;
        const targetPosition = Number.parseInt(reqData?.position, 10);

        if (!fileId || !demonData || typeof demonData !== 'object') {
            return jsonResponse({ error: 'Missing required fields' }, { status: 400 });
        }

        const filename = `data/${fileId}.json`;
        const shouldUpdatePlacements = Number.isInteger(targetPosition) && targetPosition > 0;

        try {
            const demonFilePromise = github.getFile(filename);
            const listFilePromise = shouldUpdatePlacements
                ? github.getFile(LIST_FILE)
                : Promise.resolve(null);
            const bundledFilePromise = shouldUpdatePlacements
                ? github.getFile(BUNDLED_FILE)
                : Promise.resolve(null);
            const pendingFilePromise = shouldUpdatePlacements
                ? github.getFile(PENDING_FILE)
                : Promise.resolve(null);

            const [demonFile, listFile, bundledFile, pendingFile] = await Promise.all([
                demonFilePromise,
                listFilePromise,
                bundledFilePromise,
                pendingFilePromise,
            ]);

            await github.putFile(
                filename,
                JSON.stringify(demonData, null, 4),
                `Admin Panel: Update ${fileId} data`,
                demonFile?.sha ?? null,
            );

            if (shouldUpdatePlacements && listFile) {
                const { oldIndex, insertIndex } = await updateListForMove(
                    github,
                    fileId,
                    targetPosition,
                    listFile,
                );

                // Newly inserted demons start as "projected" (pending) placements.
                if (oldIndex === -1) {
                    await addPendingPlacement(github, fileId, pendingFile);
                }

                if (bundledFile) {
                    await updateBundledForMove(
                        github,
                        fileId,
                        demonData,
                        insertIndex,
                        oldIndex,
                        bundledFile,
                    );
                }
            }

            return jsonResponse({
                success: true,
                message: `Updated ${fileId}.`,
            });
        } catch (e) {
            return jsonResponse({ error: String(e?.message ?? e) }, { status: 500 });
        }
    }

    if (request.method === 'DELETE') {
        const url = new URL(request.url);
        const fileId = String(url.searchParams.get('id') ?? '').trim();
        if (!fileId) {
            return jsonResponse({ error: 'Missing id' }, { status: 400 });
        }

        const filename = `data/${fileId}.json`;

        try {
            const [demonFile, listFile, bundledFile, pendingFile] = await Promise.all([
                github.getFile(filename),
                github.getFile(LIST_FILE),
                github.getFile(BUNDLED_FILE),
                github.getFile(PENDING_FILE),
            ]);
            let demonDataForFallback = null;
            if (demonFile?.content) {
                try {
                    const parsed = JSON.parse(demonFile.content);
                    if (parsed && typeof parsed === 'object') {
                        demonDataForFallback = parsed;
                    }
                } catch {
                    demonDataForFallback = null;
                }
            }

            const { oldIndex } = await updateListForDelete(github, fileId, listFile);
            if (bundledFile) {
                await updateBundledForDelete(
                    github,
                    fileId,
                    demonDataForFallback,
                    oldIndex,
                    bundledFile,
                );
            }

            await removePendingPlacement(github, fileId, pendingFile);

            await deleteDemonFile(github, filename, fileId, demonFile);
            return jsonResponse({ success: true });
        } catch (e) {
            return jsonResponse({ error: String(e?.message ?? e) }, { status: 500 });
        }
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
}
