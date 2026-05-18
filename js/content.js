import { round, score } from './score.js';

const dir = '/data';
const whitelist = new Set(['taiago', 'lunarspark', 'ka1sa']);
const LIST_CACHE_TTL_MS = 30_000;
const EDITORS_CACHE_TTL_MS = 300_000;
const LIST_FETCH_CONCURRENCY = 8;

let listPromise = null;
let editorsPromise = null;
let listCache = null;
let listCachedAt = 0;
let editorsCache = null;
let editorsCachedAt = 0;

async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${path}`);
    }
    return response.json();
}

async function mapWithConcurrency(items, concurrency, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    }

    const workerCount = Math.min(
        Math.max(1, Number(concurrency) || 1),
        items.length,
    );
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}

function normalizeLevel(level, path) {
    const records = Array.isArray(level.records)
        ? [...level.records].sort((a, b) => b.percent - a.percent)
        : [];

    return {
        ...level,
        path,
        records,
    };
}

async function loadList() {
    try {
        const listPaths = await fetchJson(`${dir}/_list.json`);

        try {
            const bundledData = await fetchJson(`${dir}/_list_bundled.json`);
            if (Array.isArray(bundledData) && bundledData.length > 0) {
                return listPaths.map((path, rank) => {
                    const level = bundledData[rank];
                    if (!level) {
                        console.error(`Failed to load level #${rank + 1} ${path}.`);
                        return [null, path];
                    }
                    return [normalizeLevel(level, path), null];
                });
            }
        } catch {
            // fallback to per-file fetching
        }

        // Fallback: bounded concurrency to avoid flooding the network with 150+ requests.
        return mapWithConcurrency(
            listPaths,
            LIST_FETCH_CONCURRENCY,
            async (path, rank) => {
                try {
                    const level = await fetchJson(`${dir}/${path}.json`);
                    return [normalizeLevel(level, path), null];
                } catch {
                    console.error(`Failed to load level #${rank + 1} ${path}.`);
                    return [null, path];
                }
            },
        );
    } catch {
        console.error('Failed to load list.');
        return null;
    }
}

export async function fetchList() {
    const now = Date.now();
    if (listCache && (now - listCachedAt) < LIST_CACHE_TTL_MS) {
        return listCache;
    }

    if (!listPromise) {
        listPromise = loadList().finally(() => {
            listPromise = null;
        });
    }

    const list = await listPromise;
    if (list) {
        listCache = list;
        listCachedAt = Date.now();
    } else {
        listCache = null;
        listCachedAt = 0;
    }

    return list;
}

async function loadEditors() {
    try {
        return await fetchJson(`${dir}/_editors.json`);
    } catch {
        return null;
    }
}

export async function fetchEditors() {
    const now = Date.now();
    if (editorsCache && (now - editorsCachedAt) < EDITORS_CACHE_TTL_MS) {
        return editorsCache;
    }

    if (!editorsPromise) {
        editorsPromise = loadEditors().finally(() => {
            editorsPromise = null;
        });
    }

    const editors = await editorsPromise;
    if (editors) {
        editorsCache = editors;
        editorsCachedAt = Date.now();
    } else {
        editorsCache = null;
        editorsCachedAt = 0;
    }

    return editors;
}

function getOrCreateUserScore(userScores, userNameMap, name) {
    const normalizedName = String(name ?? '').trim() || 'Unknown';
    const lowerName = normalizedName.toLowerCase();
    const canonicalName = userNameMap.get(lowerName) ?? normalizedName;

    if (!userNameMap.has(lowerName)) {
        userNameMap.set(lowerName, canonicalName);
    }

    if (!userScores.has(canonicalName)) {
        userScores.set(canonicalName, {
            verified: [],
            completed: [],
            progressed: [],
            total: 0,
        });
    }

    return userScores.get(canonicalName);
}

export async function fetchLeaderboard() {
    const list = await fetchList();
    if (!list) {
        return [[], ['_list']];
    }

    const userScores = new Map();
    const userNameMap = new Map();
    const errs = [];

    for (let rank = 0; rank < list.length; rank += 1) {
        const [level, err] = list[rank];
        if (err || !level) {
            errs.push(err ?? `#${rank + 1}`);
            continue;
        }

        const levelRank = rank + 1;
        const percentToQualify = level.percentToQualify;
        const levelName = level.name;

        const verifierLower = String(level.verifier ?? '').toLowerCase();
        if (whitelist.has(verifierLower)) {
            const verifierScores = getOrCreateUserScore(
                userScores,
                userNameMap,
                level.verifier,
            );

            const verifierEntry = {
                rank: levelRank,
                level: levelName,
                score: score(levelRank, 100, percentToQualify),
                link: level.verification,
            };

            verifierScores.verified.push(verifierEntry);
            verifierScores.total += verifierEntry.score;
        }

        const records = Array.isArray(level.records) ? level.records : [];
        for (const record of records) {
            const user = getOrCreateUserScore(userScores, userNameMap, record.user);
            const recordScore = score(
                levelRank,
                record.percent,
                percentToQualify,
            );

            if (record.percent === 100) {
                user.completed.push({
                    rank: levelRank,
                    level: levelName,
                    score: recordScore,
                    link: record.link,
                });
                user.total += recordScore;
                continue;
            }

            user.progressed.push({
                rank: levelRank,
                level: `${levelName} (${record.percent}%)`,
                score: recordScore,
                link: record.link,
            });
            user.total += recordScore;
        }
    }

    const res = Array.from(userScores.entries()).map(([user, scores]) => ({
        user,
        total: round(scores.total),
        verified: scores.verified,
        completed: scores.completed,
        progressed: scores.progressed,
    }));

    return [res.sort((a, b) => b.total - a.total), errs];
}
