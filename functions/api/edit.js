import {
    createGitHubContentClient,
    jsonResponse,
    requireAdmin,
} from '../_shared.js';

const LIST_FILE = 'data/_list.json';
const BUNDLED_FILE = 'data/_list_bundled.json';

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

            const [demonFile, listFile, bundledFile] = await Promise.all([
                demonFilePromise,
                listFilePromise,
                bundledFilePromise,
            ]);

            await github.putFile(
                filename,
                JSON.stringify(demonData, null, 4),
                `Admin Panel: Update ${fileId} data`,
                demonFile?.sha ?? null,
            );

            if (shouldUpdatePlacements && listFile) {
                const parsedList = safeParseArray(listFile.content);
                let listArray = parsedList.filter((x) => typeof x === 'string');
                const oldIndex = listArray.indexOf(fileId);

                listArray = listArray.filter((x) => x !== fileId);

                const insertIndex = clamp(targetPosition - 1, 0, listArray.length);
                listArray.splice(insertIndex, 0, fileId);

                const ops = [];
                ops.push(
                    github.putFile(
                        LIST_FILE,
                        JSON.stringify(listArray, null, 4),
                        `Admin Panel: Move ${fileId} to #${targetPosition}`,
                        listFile.sha,
                    ),
                );

                if (bundledFile) {
                    const bundledArray = safeParseArray(bundledFile.content);

                    let removeIndex = -1;
                    if (oldIndex !== -1 && oldIndex < bundledArray.length) {
                        removeIndex = oldIndex;
                    } else {
                        const demonId = demonData?.id;
                        const demonName = demonData?.name;
                        removeIndex = bundledArray.findIndex(
                            (x) => x?.id === demonId || x?.name === demonName,
                        );
                    }

                    if (removeIndex !== -1) {
                        bundledArray.splice(removeIndex, 1);
                    }

                    bundledArray.splice(insertIndex, 0, demonData);

                    ops.push(
                        github.putFile(
                            BUNDLED_FILE,
                            JSON.stringify(bundledArray),
                            `Admin Panel: Update bundled data for ${fileId}`,
                            bundledFile.sha,
                        ),
                    );
                }

                await Promise.all(ops);
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
            const [demonFile, listFile, bundledFile] = await Promise.all([
                github.getFile(filename),
                github.getFile(LIST_FILE),
                github.getFile(BUNDLED_FILE),
            ]);

            const ops = [];

            if (demonFile) {
                ops.push(
                    github.deleteFile(
                        filename,
                        `Admin Panel: Delete ${fileId}`,
                        demonFile.sha,
                    ),
                );
            }

            let oldIndex = -1;
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

            if (listFile) {
                const parsedList = safeParseArray(listFile.content);
                const listArray = parsedList.filter((x) => typeof x === 'string');

                oldIndex = listArray.indexOf(fileId);
                const newArray = listArray.filter((x) => x !== fileId);

                if (newArray.length !== listArray.length) {
                    ops.push(
                        github.putFile(
                            LIST_FILE,
                            JSON.stringify(newArray, null, 4),
                            `Admin Panel: Remove ${fileId} from list`,
                            listFile.sha,
                        ),
                    );
                }
            }

            if (bundledFile) {
                const bundledArray = safeParseArray(bundledFile.content);

                let removeIndex = -1;
                if (oldIndex !== -1 && oldIndex < bundledArray.length) {
                    removeIndex = oldIndex;
                } else if (demonDataForFallback) {
                    const demonId = demonDataForFallback?.id;
                    const demonName = demonDataForFallback?.name;
                    removeIndex = bundledArray.findIndex(
                        (x) => x?.id === demonId || x?.name === demonName,
                    );
                }

                if (removeIndex !== -1) {
                    bundledArray.splice(removeIndex, 1);
                    ops.push(
                        github.putFile(
                            BUNDLED_FILE,
                            JSON.stringify(bundledArray),
                            `Admin Panel: Remove ${fileId} from bundled list`,
                            bundledFile.sha,
                        ),
                    );
                }
            }

            await Promise.all(ops);
            return jsonResponse({ success: true });
        } catch (e) {
            return jsonResponse({ error: String(e?.message ?? e) }, { status: 500 });
        }
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
}
