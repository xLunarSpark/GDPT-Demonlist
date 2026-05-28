import Spinner from '../components/Spinner.js';
import { fetchLeaderboard } from '../content.js';
import { localize } from '../util.js';

const DISTRICTS = [
    { key: 'viana-do-castelo', name: 'Viana do Castelo' },
    { key: 'braga', name: 'Braga' },
    { key: 'vila-real', name: 'Vila Real' },
    { key: 'braganca', name: 'Braganca' },
    { key: 'porto', name: 'Porto' },
    { key: 'aveiro', name: 'Aveiro' },
    { key: 'viseu', name: 'Viseu' },
    { key: 'guarda', name: 'Guarda' },
    { key: 'coimbra', name: 'Coimbra' },
    { key: 'castelo-branco', name: 'Castelo Branco' },
    { key: 'leiria', name: 'Leiria' },
    { key: 'santarem', name: 'Santarem' },
    { key: 'lisboa', name: 'Lisboa' },
    { key: 'setubal', name: 'Setubal' },
    { key: 'portalegre', name: 'Portalegre' },
    { key: 'evora', name: 'Evora' },
    { key: 'beja', name: 'Beja' },
    { key: 'faro', name: 'Faro' },
];

const DISTRICT_CENTER_HINTS = [
    { key: 'viana-do-castelo', x: 0.22, y: 0.08 },
    { key: 'braga', x: 0.28, y: 0.12 },
    { key: 'vila-real', x: 0.42, y: 0.12 },
    { key: 'braganca', x: 0.62, y: 0.12 },
    { key: 'porto', x: 0.27, y: 0.2 },
    { key: 'aveiro', x: 0.3, y: 0.3 },
    { key: 'viseu', x: 0.44, y: 0.3 },
    { key: 'guarda', x: 0.62, y: 0.3 },
    { key: 'coimbra', x: 0.34, y: 0.4 },
    { key: 'castelo-branco', x: 0.58, y: 0.43 },
    { key: 'leiria', x: 0.3, y: 0.5 },
    { key: 'santarem', x: 0.43, y: 0.52 },
    { key: 'lisboa', x: 0.3, y: 0.6 },
    { key: 'setubal', x: 0.35, y: 0.66 },
    { key: 'portalegre', x: 0.58, y: 0.57 },
    { key: 'evora', x: 0.54, y: 0.69 },
    { key: 'beja', x: 0.52, y: 0.8 },
    { key: 'faro', x: 0.6, y: 0.93 },
];

const DISTRICT_CENTER_BY_KEY = new Map(
    DISTRICT_CENTER_HINTS.map((district) => [district.key, district])
);

const DISTRICT_KEY_BY_NAME = new Map(
    DISTRICTS.map((district) => [normalizeRegionName(district.name), district.key])
);

const DISTRICT_ALIASES = new Map();

function stripDiacritics(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function normalizeRegionName(value) {
    return stripDiacritics(String(value ?? '')).trim().toLowerCase();
}

function normalizeName(value) {
    return normalizeRegionName(value);
}

function getDistrictPaths(svg) {
    const layer = svg.querySelector('#layer6') || svg;
    const paths = Array.from(layer.querySelectorAll('path'));
    if (paths.length === 0) {
        return [];
    }

    const filtered = paths.filter((path) => {
        const hasData = path.hasAttribute('data-district');
        const hasClass = Boolean(path.getAttribute('class'));
        return hasData || hasClass;
    });

    return filtered.length > 0 ? filtered : paths;
}

function cleanSVGPresentation(el) {
    try {
        ['fill', 'stroke', 'style', 'fill-opacity', 'stroke-opacity', 'opacity'].forEach((attr) => {
            if (el.hasAttribute && el.hasAttribute(attr)) {
                el.removeAttribute(attr);
            }
        });
        if (el.style) {
            el.style.fill = '';
            el.style.stroke = '';
            el.style.opacity = '';
        }
    } catch (e) {
        // ignore
    }
}

function resolveDistrictKey(value) {
    const normalized = normalizeRegionName(value);
    if (DISTRICT_KEY_BY_NAME.has(normalized)) {
        return DISTRICT_KEY_BY_NAME.get(normalized);
    }
    return DISTRICT_ALIASES.get(normalized) || null;
}

function getHardestEntry(entry) {
    const completed = Array.isArray(entry?.completed) ? entry.completed : [];
    const verified = Array.isArray(entry?.verified) ? entry.verified : [];
    const candidates = [...verified, ...completed];
    if (candidates.length === 0) {
        return null;
    }

    return candidates.reduce((best, item) => {
        if (!best || item.rank < best.rank) {
            return item;
        }
        return best;
    }, null);
}

function solveAssignment(costMatrix) {
    const size = costMatrix.length;
    if (size === 0 || costMatrix.some((row) => row.length !== size)) {
        return null;
    }

    const u = new Array(size + 1).fill(0);
    const v = new Array(size + 1).fill(0);
    const p = new Array(size + 1).fill(0);
    const way = new Array(size + 1).fill(0);

    for (let i = 1; i <= size; i += 1) {
        p[0] = i;
        let j0 = 0;
        const minv = new Array(size + 1).fill(Infinity);
        const used = new Array(size + 1).fill(false);

        do {
            used[j0] = true;
            const i0 = p[j0];
            let delta = Infinity;
            let j1 = 0;

            for (let j = 1; j <= size; j += 1) {
                if (used[j]) continue;
                const cur = costMatrix[i0 - 1][j - 1] - u[i0] - v[j];
                if (cur < minv[j]) {
                    minv[j] = cur;
                    way[j] = j0;
                }
                if (minv[j] < delta) {
                    delta = minv[j];
                    j1 = j;
                }
            }

            for (let j = 0; j <= size; j += 1) {
                if (used[j]) {
                    u[p[j]] += delta;
                    v[j] -= delta;
                } else {
                    minv[j] -= delta;
                }
            }

            j0 = j1;
        } while (p[j0] !== 0);

        do {
            const j1 = way[j0];
            p[j0] = p[j1];
            j0 = j1;
        } while (j0 !== 0);
    }

    const assignment = new Array(size);
    for (let j = 1; j <= size; j += 1) {
        if (p[j] > 0) {
            assignment[p[j] - 1] = j - 1;
        }
    }

    return assignment.every((value) => Number.isInteger(value)) ? assignment : null;
}

function autoAssignDistricts(svg, districts) {
    const paths = getDistrictPaths(svg);
    if (paths.length === 0) {
        return [];
    }

    const viewBox = svg.viewBox?.baseVal;
    const svgRect = svg.getBoundingClientRect();
    const vb = viewBox
        ? { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height }
        : null;

    const getPathBox = (path) => {
        try {
            const box = path.getBBox();
            return { x: box.x, y: box.y, width: box.width, height: box.height, source: 'bbox' };
        } catch {
            if (!svgRect.width || !svgRect.height) {
                return null;
            }
            const rect = path.getBoundingClientRect();
            return {
                x: rect.left - svgRect.left,
                y: rect.top - svgRect.top,
                width: rect.width,
                height: rect.height,
                source: 'rect',
            };
        }
    };

    const pathInfos = paths
        .map((path) => {
            const box = getPathBox(path);
            if (!box) {
                return null;
            }

            const area = box.width * box.height;
            const base = vb && box.source === 'bbox'
                ? vb
                : { x: 0, y: 0, width: svgRect.width, height: svgRect.height };

            return {
                el: path,
                area,
                cx: (box.x + box.width / 2 - base.x) / base.width,
                cy: (box.y + box.height / 2 - base.y) / base.height,
            };
        })
        .filter((info) => info && Number.isFinite(info.area) && info.area > 0);

    pathInfos.sort((a, b) => b.area - a.area);
    const topPaths = pathInfos.slice(0, districts.length);
    const targets = districts
        .map((district) => DISTRICT_CENTER_BY_KEY.get(district.key))
        .filter(Boolean);

    if (targets.length !== districts.length || topPaths.length !== districts.length) {
        return [];
    }

    const costMatrix = targets.map((district) =>
        topPaths.map((path) => {
            const dx = path.cx - district.x;
            const dy = path.cy - district.y;
            return Math.hypot(dx, dy);
        })
    );

    const assignment = solveAssignment(costMatrix);
    if (!assignment) {
        return [];
    }

    const matches = targets.map((district, index) => ({
        key: district.key,
        el: topPaths[assignment[index]].el,
    }));

    matches.forEach((match) => {
            try {
                match.el.setAttribute('data-district', match.key);
                match.el.setAttribute('data-district-debug', match.key);
                cleanSVGPresentation(match.el);
                // eslint-disable-next-line no-console
                console.log('[map] assigned', match.key, '->', match.el.id || match.el.getAttribute('id') || match.el.tagName);
            } catch (e) {
                // ignore
            }
    });

    return matches.map((match) => match.el);
}

function assignDistrictsByOrder(svg, districts) {
    const paths = getDistrictPaths(svg);
    if (paths.length === 0) {
        return [];
    }

    const svgRect = svg.getBoundingClientRect();
    if (!svgRect.width || !svgRect.height) {
        return [];
    }

    const pathInfos = paths
        .map((path) => {
            const rect = path.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            if (!width || !height) {
                return null;
            }
            return {
                el: path,
                area: width * height,
                cx: rect.left + width / 2,
                cy: rect.top + height / 2,
            };
        })
        .filter(Boolean);

    if (pathInfos.length < districts.length) {
        return [];
    }

    pathInfos.sort((a, b) => {
        if (a.cy !== b.cy) return a.cy - b.cy;
        return a.cx - b.cx;
    });

    const selected = pathInfos.slice(0, districts.length);
    selected.forEach((info, index) => {
        info.el.setAttribute('data-district', districts[index].key);
    });

    return selected.map((info) => info.el);
}

export default {
    components: { Spinner },
    data: () => ({
        loading: true,
        error: '',
        districts: DISTRICTS,
        hoverDistrict: null,
        selectedDistrict: null,
        districtStats: {},
        mapSvg: '',
        mapAssetError: '',
        mapElements: null,
        mapBound: false,
    }),
    computed: {
        hoverStats() {
            if (!this.hoverDistrict) {
                return null;
            }
            return this.districtStats[this.hoverDistrict] || null;
        },
        selectedStats() {
            if (!this.selectedDistrict) {
                return null;
            }
            return this.districtStats[this.selectedDistrict] || null;
        },
        hoverDistrictName() {
            return this.getDistrictName(this.hoverDistrict);
        },
        selectedDistrictName() {
            return this.getDistrictName(this.selectedDistrict);
        },
        selectedRanking() {
            const ranking = this.selectedStats?.ranking || [];
            return ranking.slice(0, 10);
        },
    },
    template: `
        <main class="page-map">
            <div class="map-shell">
                <div class="map-hero">
                    <div>
                        <h1 class="type-title-lg">Portugal Districts</h1>
                        <p class="type-body-md">Hover a district to see hardest beaten, total points, and best player. Click for district rankings.</p>
                    </div>
                </div>

                <div v-if="loading" class="map-loading">
                    <Spinner></Spinner>
                </div>

                <div v-else class="map-grid">
                    <div class="map-panel-stack">
                        <div class="map-panel">
                            <h2 class="type-title-sm">Hover Details</h2>
                            <template v-if="hoverStats">
                                <p class="type-body-md">District: <strong>{{ hoverDistrictName }}</strong></p>
                                <p class="type-body-md">Total points: <strong>{{ formatPoints(hoverStats.points) }}</strong></p>
                                <p class="type-body-md">
                                    Best player:
                                    <strong>{{ hoverStats.bestPlayer || 'No data' }}</strong>
                                    <span v-if="hoverStats.bestPlayer">({{ formatPoints(hoverStats.bestPlayerPoints) }})</span>
                                </p>
                                <p class="type-body-md" v-if="hoverStats.hardestLevel">
                                    Hardest beaten: <strong>#{{ hoverStats.hardestRank }} {{ hoverStats.hardestLevel }}</strong>
                                </p>
                                <p class="type-body-md" v-else>
                                    Hardest beaten: <strong>No completions yet</strong>
                                </p>
                            </template>
                            <p v-else class="type-body-md">Hover a district on the map.</p>
                            <p v-if="error" class="map-error">{{ error }}</p>
                        </div>

                        <div class="map-ranking">
                            <div class="map-ranking-header">
                                <h2 class="type-title-sm">District Ranking</h2>
                                <button v-if="selectedDistrict" class="map-clear" @click="clearSelection">Clear</button>
                            </div>
                            <p v-if="!selectedStats" class="type-body-md">Click a district to see its ranking.</p>
                            <div v-else>
                                <p class="type-body-md">{{ selectedDistrictName }}</p>
                                <table class="map-ranking-table" v-if="selectedRanking.length">
                                    <tr v-for="(entry, index) in selectedRanking" :key="entry.user">
                                        <td class="rank">#{{ index + 1 }}</td>
                                        <td class="name">{{ entry.user }}</td>
                                        <td class="points">{{ formatPoints(entry.points) }}</td>
                                    </tr>
                                </table>
                                <p v-else class="type-body-md">No ranked players yet.</p>
                            </div>
                        </div>
                    </div>

                    <div class="map-canvas" @mouseleave="clearHover">
                        <div v-if="mapSvg" ref="mapSvgContainer" class="map-svg-wrapper" v-html="mapSvg"></div>
                        <div v-else class="map-missing">
                            <p class="type-body-md">Add /assets/portugal-districts.svg to enable the district map.</p>
                            <p v-if="mapAssetError" class="map-error">{{ mapAssetError }}</p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    `,
    async mounted() {
        this.mapElements = new Map();
        await Promise.all([this.loadStats(), this.loadMapSvg()]);
        this.loading = false;
        this.$nextTick(() => {
            requestAnimationFrame(() => this.bindMapEvents());
        });
    },
    methods: {
        async loadStats() {
            try {
                const [leaderboardResult, profiles] = await Promise.all([
                    fetchLeaderboard(),
                    fetch('/api/profiles').then((res) => res.ok ? res.json() : []),
                ]);

                const tuple = Array.isArray(leaderboardResult) ? leaderboardResult : [[], []];
                const boardEntries = Array.isArray(tuple[0]) ? tuple[0] : [];
                const loadErrors = Array.isArray(tuple[1]) ? tuple[1] : [];
                if (loadErrors.length > 0) {
                    this.error = 'Leaderboard data is incomplete for some levels.';
                }

                const leaderboardMap = new Map();
                (Array.isArray(boardEntries) ? boardEntries : []).forEach((entry) => {
                    if (!entry?.user) return;
                    leaderboardMap.set(normalizeName(entry.user), entry);
                });

                const stats = {};
                this.districts.forEach((district) => {
                    stats[district.key] = {
                        players: 0,
                        points: 0,
                        hardestRank: null,
                        hardestLevel: null,
                        bestPlayer: null,
                        bestPlayerPoints: 0,
                        ranking: [],
                    };
                });

                (Array.isArray(profiles) ? profiles : []).forEach((profile) => {
                    const districtKey = resolveDistrictKey(profile?.region);
                    if (!districtKey || !stats[districtKey]) return;

                    const stat = stats[districtKey];
                    stat.players += 1;

                    const linkedName = profile?.linked_gd_name || profile?.gd_name;
                    const entry = leaderboardMap.get(normalizeName(linkedName));
                    if (!entry) {
                        return;
                    }

                    const entryPoints = Number(entry.total) || 0;
                    stat.points += entryPoints;
                    stat.ranking.push({ user: entry.user, points: entryPoints });

                    if (entryPoints > stat.bestPlayerPoints) {
                        stat.bestPlayerPoints = entryPoints;
                        stat.bestPlayer = entry.user;
                    }

                    const hardest = getHardestEntry(entry);
                    if (hardest && (stat.hardestRank === null || hardest.rank < stat.hardestRank)) {
                        stat.hardestRank = hardest.rank;
                        stat.hardestLevel = hardest.level;
                    }
                });

                Object.values(stats).forEach((stat) => {
                    stat.ranking.sort((a, b) => b.points - a.points);
                });

                this.districtStats = stats;
            } catch (e) {
                this.error = e?.message || 'Failed to load map data.';
            }
        },
        async loadMapSvg() {
            try {
                const res = await fetch('/assets/portugal-districts.svg', { cache: 'no-store' });
                if (!res.ok) {
                    this.mapAssetError = 'District SVG not found.';
                    return;
                }

                this.mapSvg = await res.text();
                this.$nextTick(() => {
                    requestAnimationFrame(() => this.bindMapEvents());
                });
            } catch (e) {
                this.mapAssetError = e?.message || 'Failed to load map asset.';
            }
        },
        bindMapEvents() {
            if (this.mapBound) {
                return;
            }
            const container = this.$refs.mapSvgContainer;
            if (!container) {
                return;
            }

            let elements = Array.from(container.querySelectorAll('[data-district]'));
            if (elements.length === 0) {
                const svg = container.querySelector('svg');
                if (svg) {
                    elements = autoAssignDistricts(svg, this.districts);
                    if (elements.length === 0) {
                        elements = assignDistrictsByOrder(svg, this.districts);
                    }
                }
            }

            if (elements.length === 0) {
                const svg = container.querySelector('svg');
                if (svg) {
                    const fallbackPaths = getDistrictPaths(svg);
                    fallbackPaths.forEach((path) => {
                        cleanSVGPresentation(path);
                        path.classList.add('map-region');
                    });
                    this.mapAssetError = 'Showing map without district data. Please provide a district-tagged SVG for hover details.';
                    return;
                }

                this.mapAssetError = 'Unable to detect district shapes in the SVG.';
                return;
            }

            elements.forEach((el) => {
                const key = el.getAttribute('data-district');
                if (!key) {
                    return;
                }
                cleanSVGPresentation(el);
                el.classList.add('map-region');
                el.addEventListener('mouseenter', () => this.setHover(key));
                el.addEventListener('click', () => this.setSelected(key));
                this.mapElements.set(key, el);
            });

            this.mapBound = true;
            this.syncMapHighlights();
        },
        syncMapHighlights() {
            if (!this.mapElements) {
                return;
            }

            const container = this.$refs.mapSvgContainer;
            const computed = container ? getComputedStyle(container) : null;
            const highlight = computed ? computed.getPropertyValue('--map-highlight').trim() : '';
            const highlightStroke = computed ? computed.getPropertyValue('--map-highlight-stroke').trim() : '';
            const selectedFill = computed ? computed.getPropertyValue('--map-selected').trim() : '';
            const selectedStroke = computed ? computed.getPropertyValue('--map-selected-stroke').trim() : '';

            this.mapElements.forEach((el, key) => {
                const isActive = key === this.hoverDistrict;
                const isSelected = key === this.selectedDistrict;
                el.classList.toggle('active', isActive);
                el.classList.toggle('selected', isSelected);

                try {
                    if (isActive) {
                        if (highlight) {
                            el.style.fill = highlight;
                        }
                        if (highlightStroke) {
                            el.style.stroke = highlightStroke;
                        }
                        el.style.fillOpacity = '1';
                    } else if (isSelected) {
                        if (selectedFill) {
                            el.style.fill = selectedFill;
                        }
                        if (selectedStroke) {
                            el.style.stroke = selectedStroke;
                        }
                        el.style.fillOpacity = '1';
                    } else {
                        el.style.fill = '';
                        el.style.stroke = '';
                        el.style.fillOpacity = '';
                    }
                } catch (e) {
                    // ignore style errors
                }
            });
        },
        setHover(key) {
            // eslint-disable-next-line no-console
            console.log('[map] hover', key);
            this.hoverDistrict = key;
            this.syncMapHighlights();
        },
        clearHover() {
            this.hoverDistrict = null;
            this.syncMapHighlights();
        },
        setSelected(key) {
            // eslint-disable-next-line no-console
            console.log('[map] select', key);
            this.selectedDistrict = key;
            this.syncMapHighlights();
        },
        clearSelection() {
            this.selectedDistrict = null;
            this.syncMapHighlights();
        },
        formatPoints(value) {
            return localize(Number(value) || 0);
        },
        getDistrictName(key) {
            if (!key) return '';
            const district = this.districts.find((entry) => entry.key === key);
            return district ? district.name : '';
        },
    },
};
