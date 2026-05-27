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
    { key: 'acores', name: 'Açores' },
    { key: 'madeira', name: 'Madeira' },
];

const DISTRICT_KEY_BY_NAME = new Map(
    DISTRICTS.map((district) => [normalizeRegionName(district.name), district.key])
);

const DISTRICT_ALIASES = new Map([
    ['azores', 'acores'],
    ['acores', 'acores'],
    ['madeira', 'madeira'],
]);

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
                            <p class="type-body-md">Add /assets/portugal-districts.svg with data-district attributes to enable the district map.</p>
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
                    if (!districtKey) return;

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
                    this.bindMapEvents();
                });
            } catch (e) {
                this.mapAssetError = e?.message || 'Failed to load map asset.';
            }
        },
        bindMapEvents() {
            const container = this.$refs.mapSvgContainer;
            if (!container) {
                return;
            }

            const elements = Array.from(container.querySelectorAll('[data-district]'));
            elements.forEach((el) => {
                const key = el.getAttribute('data-district');
                if (!key) {
                    return;
                }
                el.classList.add('map-region');
                el.addEventListener('mouseenter', () => this.setHover(key));
                el.addEventListener('click', () => this.setSelected(key));
                this.mapElements.set(key, el);
            });

            this.syncMapHighlights();
        },
        syncMapHighlights() {
            if (!this.mapElements) {
                return;
            }

            this.mapElements.forEach((el, key) => {
                el.classList.toggle('active', key === this.hoverDistrict);
                el.classList.toggle('selected', key === this.selectedDistrict);
            });
        },
        setHover(key) {
            this.hoverDistrict = key;
            this.syncMapHighlights();
        },
        clearHover() {
            this.hoverDistrict = null;
            this.syncMapHighlights();
        },
        setSelected(key) {
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
