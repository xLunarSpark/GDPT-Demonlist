import { round, score } from './score.js';

/**
 * Path to directory containing `_list.json` and all levels
 */
const dir = '/data';

// Lista de verificadores permitidos
const whitelist = ["Taiago", "LunarSpark", "Ka1sa"];

export async function fetchList() {
    const listResult = await fetch(`${dir}/_list.json`);
    try {
        const list = await listResult.json();
        return await Promise.all(
            list.map(async (path, rank) => {
                const levelResult = await fetch(`${dir}/${path}.json`);
                try {
                    const level = await levelResult.json();
                    return [
                        {
                            ...level,
                            path,
                            records: level.records.sort(
                                (a, b) => b.percent - a.percent,
                            ),
                        },
                        null,
                    ];
                } catch {
                    console.error(`Failed to load level #${rank + 1} ${path}.`);
                    return [null, path];
                }
            }),
        );
    } catch {
        console.error(`Failed to load list.`);
        return null;
    }
}

export async function fetchEditors() {
    try {
        const editorsResults = await fetch(`${dir}/_editors.json`);
        const editors = await editorsResults.json();
        return editors;
    } catch {
        return null;
    }
}

export async function fetchLeaderboard() {
    const list = await fetchList();

    const scoreMap = {};
    const errs = [];
    list.forEach(([level, err], rank) => {
        if (err) {
            errs.push(err);
            return;
        }

        // Verificação e filtro por whitelist
        if (whitelist.includes(level.verifier)) {
            const verifier = Object.keys(scoreMap).find(
                (u) => u.toLowerCase() === level.verifier.toLowerCase(),
            ) || level.verifier;
            scoreMap[verifier] ??= {
                verified: [],
                completed: [],
                progressed: [],
            };
            const { verified } = scoreMap[verifier];
            verified.push({
                rank: rank + 1,
                level: level.name,
                score: score(rank + 1, 100, level.percentToQualify),
                link: level.verification,
            });
        }

        // Records
        level.records.forEach((record) => {
            const user = Object.keys(scoreMap).find(
                (u) => u.toLowerCase() === record.user.toLowerCase(),
            ) || record.user;
            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
            };
            const { completed, progressed } = scoreMap[user];
            if (record.percent === 100) {
                completed.push({
                    rank: rank + 1,
                    level: level.name,
                    score: score(rank + 1, 100, level.percentToQualify),
                    link: record.link,
                });
                return;
            }

            progressed.push({
                rank: rank + 1,
                level: level.name,
                percent: record.percent,
                score: score(rank + 1, record.percent, level.percentToQualify),
                link: record.link,
            });
        });
    });

    // Wrap in extra Object containing the user and total score
    const res = Object.entries(scoreMap).map(([user, scores]) => {
        const { verified, completed, progressed } = scores;
        const total = [verified, completed, progressed]
            .flat()
            .reduce((prev, cur) => prev + cur.score, 0);

        return {
            user,
            total: round(total),
            ...scores,
        };
    });

    // Sort by total score
    return [res.sort((a, b) => b.total - a.total), errs];
}

// Agora definindo o componente React para o perfil do jogador
import React from 'react';

function PlayerProfile({ profile }) {
    return (
        <div>
            <h1>#{profile.rank} {profile.name}</h1>
            <div>{profile.score}</div>

            <h2>Completed ({profile.completed.length})</h2>
            <ul>
                {profile.completed.map((level, index) => (
                    <li key={index}>
                        #{level.rank} {level.name}
                        <span>{level.score}</span>
                    </li>
                ))}
            </ul>

            <h2>Progressed ({profile.progressed.length})</h2>
            <ul>
                {profile.progressed.map((level, index) => (
                    <li key={index}>
                        #{level.rank} {level.name} ({level.percent}%)
                        <span>{level.score}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default PlayerProfile;
