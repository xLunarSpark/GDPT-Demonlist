import { fetchList } from '../content.js';
import { getThumbnailFromId, getYoutubeIdFromUrl, shuffle } from '../util.js';

import Spinner from '../components/Spinner.js';
import Btn from '../components/Btn.js';

const ROULETTE_STORAGE_KEY = 'roulette';
const MAX_ROULETTE_LEVELS = 100;
const MAIN_LIST_LIMIT = 75;
const EXTENDED_LIST_LIMIT = 150;

function normalizeRouletteLevel(rawLevel) {
    if (!rawLevel || typeof rawLevel !== 'object') {
        return null;
    }

    const video = rawLevel.video ?? rawLevel.verification ?? '';
    const youtubeId = rawLevel.youtubeId ?? getYoutubeIdFromUrl(video);
    const thumbnail = rawLevel.thumbnail ?? getThumbnailFromId(youtubeId);

    return {
        ...rawLevel,
        video,
        youtubeId,
        thumbnail,
    };
}

function normalizeRouletteLevels(levels) {
    if (!Array.isArray(levels)) {
        return [];
    }
    return levels.map(normalizeRouletteLevel).filter(Boolean);
}

function readSavedRoulette() {
    try {
        const parsed = JSON.parse(localStorage.getItem(ROULETTE_STORAGE_KEY));
        if (!parsed || !Array.isArray(parsed.levels) || !Array.isArray(parsed.progression)) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export default {
    components: { Spinner, Btn },
    template: `
        <main v-if="loading">
            <Spinner></Spinner>
        </main>
        <main v-else class="page-roulette">
            <div class="sidebar">
                <p class="type-label-md" style="color: #aaa">
                    Shameless copy of the Extreme Demon Roulette by <a href="https://matcool.github.io/extreme-demon-roulette/" target="_blank">matcool</a>.
                </p>
                <form class="options">
                    <div class="check">
                        <input type="checkbox" id="main" value="Main List" v-model="useMainList">
                        <label for="main">Main List</label>
                    </div>
                    <div class="check">
                        <input type="checkbox" id="extended" value="Extended List" v-model="useExtendedList">
                        <label for="extended">Extended List</label>
                    </div>
                    <Btn @click.native.prevent="onStart">{{ levels.length === 0 ? 'Start' : 'Restart'}}</Btn>
                </form>
                <p class="type-label-md" style="color: #aaa">
                    The roulette saves automatically.
                </p>
                <form class="save">
                    <p>Manual Load/Save</p>
                    <div class="btns">
                        <Btn @click.native.prevent="onImport">Import</Btn>
                        <Btn :disabled="!isActive" @click.native.prevent="onExport">Export</Btn>
                    </div>
                </form>
            </div>
            <section class="levels-container">
                <div class="levels">
                    <template v-if="levels.length > 0">
                        <!-- Completed Levels -->
                        <div class="level" v-for="(level, i) in completedLevels" :key="level.id + '-' + level.rank">
                            <a :href="level.video" class="video">
                                <img :src="level.thumbnail" alt="" width="192" height="108" loading="lazy">
                            </a>
                            <div class="meta">
                                <p>#{{ level.rank }}</p>
                                <h2>{{ level.name }}</h2>
                                <p style="color: #00b54b; font-weight: 700">{{ progression[i] }}%</p>
                            </div>
                        </div>
                        <!-- Current Level -->
                        <div class="level" v-if="!hasCompleted">
                            <a :href="currentLevel.video" target="_blank" class="video">
                                <img :src="currentLevel.thumbnail" alt="" width="192" height="108" loading="lazy">
                            </a>
                            <div class="meta">
                                <p>#{{ currentLevel.rank }}</p>
                                <h2>{{ currentLevel.name }}</h2>
                                <p>{{ currentLevel.id }}</p>
                            </div>
                            <form class="actions" v-if="!givenUp">
                                <input type="number" v-model="percentage" :placeholder="placeholder" :min="currentPercentage + 1" max=100>
                                <Btn @click.native.prevent="onDone">Done</Btn>
                                <Btn @click.native.prevent="onGiveUp" style="background-color: #e91e63;">Give Up</Btn>
                            </form>
                        </div>
                        <!-- Results -->
                        <div v-if="givenUp || hasCompleted" class="results">
                            <h1>Results</h1>
                            <p>Number of levels: {{ progression.length }}</p>
                            <p>Highest percent: {{ currentPercentage }}%</p>
                            <Btn v-if="currentPercentage < 99 && !hasCompleted" @click.native.prevent="showRemaining = true">Show remaining levels</Btn>
                        </div>
                        <!-- Remaining Levels -->
                        <template v-if="givenUp && showRemaining">
                            <div class="level" v-for="(level, i) in remainingLevels" :key="level.id + '-' + level.rank">
                                <a :href="level.video" target="_blank" class="video">
                                    <img :src="level.thumbnail" alt="" width="192" height="108" loading="lazy">
                                </a>
                                <div class="meta">
                                    <p>#{{ level.rank }}</p>
                                    <h2>{{ level.name }}</h2>
                                    <p style="color: #d50000; font-weight: 700">{{ currentPercentage + 2 + i }}%</p>
                                </div>
                            </div>
                        </template>
                    </template>
                </div>
            </section>
            <div class="toasts-container">
                <div class="toasts">
                    <div v-for="(toast, i) in toasts" :key="toast + '-' + i" class="toast">
                        <p>{{ toast }}</p>
                    </div>
                </div>
            </div>
        </main>
    `,
    data: () => ({
        loading: false,
        levels: [],
        progression: [], // list of percentages completed
        percentage: undefined,
        givenUp: false,
        showRemaining: false,
        useMainList: true,
        useExtendedList: true,
        toasts: [],
        fileInput: undefined,
    }),
    mounted() {
        // Create File Input
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.multiple = false;
        this.fileInput.accept = '.json';
        this.fileInput.addEventListener('change', this.onImportUpload);

        // Load progress from local storage
        const roulette = readSavedRoulette();

        if (!roulette) {
            return;
        }

        this.levels = normalizeRouletteLevels(roulette.levels);
        this.progression = roulette.progression;
    },
    beforeUnmount() {
        if (this.fileInput) {
            this.fileInput.removeEventListener('change', this.onImportUpload);
        }
    },
    computed: {
        completedLevels() {
            return this.levels.slice(0, this.progression.length);
        },
        remainingLevels() {
            const start = this.progression.length + 1;
            const count = Math.max(0, this.levels.length - this.currentPercentage - 1);
            return this.levels.slice(start, start + count);
        },
        currentLevel() {
            return this.levels[this.progression.length];
        },
        currentPercentage() {
            return this.progression[this.progression.length - 1] || 0;
        },
        placeholder() {
            return `At least ${this.currentPercentage + 1}%`;
        },
        hasCompleted() {
            return (
                this.progression[this.progression.length - 1] >= 100 ||
                this.progression.length === this.levels.length
            );
        },
        isActive() {
            return (
                this.progression.length > 0 &&
                !this.givenUp &&
                !this.hasCompleted
            );
        },
    },
    methods: {
        shuffle,
        getThumbnailFromId,
        getYoutubeIdFromUrl,
        async onStart() {
            if (this.isActive) {
                this.showToast('Give up before starting a new roulette.');
                return;
            }

            if (!this.useMainList && !this.useExtendedList) {
                this.showToast('Select at least one list.');
                return;
            }

            this.loading = true;

            const fullList = await fetchList();
            if (!fullList) {
                this.loading = false;
                this.showToast('Failed to load list.');
                return;
            }

            if (fullList.some(([_, err]) => err)) {
                this.loading = false;
                this.showToast(
                    'List is currently broken. Wait until it\'s fixed to start a roulette.',
                );
                return;
            }

            const list = [];
            for (let index = 0; index < fullList.length; index += 1) {
                const [level] = fullList[index];
                if (!level) {
                    continue;
                }

                const rank = index + 1;
                const isMainList = rank <= MAIN_LIST_LIMIT;
                const isExtendedList = rank > MAIN_LIST_LIMIT && rank <= EXTENDED_LIST_LIMIT;

                if ((isMainList && this.useMainList) || (isExtendedList && this.useExtendedList)) {
                    const youtubeId = getYoutubeIdFromUrl(level.verification);
                    list.push({
                        rank,
                        id: level.id,
                        name: level.name,
                        video: level.verification,
                        youtubeId,
                        thumbnail: getThumbnailFromId(youtubeId),
                    });
                }
            }

            // random 100 levels
            this.levels = shuffle(list).slice(0, MAX_ROULETTE_LEVELS);
            this.showRemaining = false;
            this.givenUp = false;
            this.progression = [];
            this.percentage = undefined;

            this.save();
            this.loading = false;
        },
        save() {
            localStorage.setItem(
                ROULETTE_STORAGE_KEY,
                JSON.stringify({
                    levels: this.levels,
                    progression: this.progression,
                }),
            );
        },
        onDone() {
            const nextPercentage = Number(this.percentage);
            if (!Number.isFinite(nextPercentage)) {
                return;
            }

            if (
                nextPercentage <= this.currentPercentage ||
                nextPercentage > 100
            ) {
                this.showToast('Invalid percentage.');
                return;
            }

            this.progression.push(nextPercentage);
            this.percentage = undefined;

            this.save();
        },
        onGiveUp() {
            this.givenUp = true;

            // Save progress
            localStorage.removeItem(ROULETTE_STORAGE_KEY);
        },
        onImport() {
            if (
                this.isActive &&
                !window.confirm('This will overwrite the currently running roulette. Continue?')
            ) {
                return;
            }

            if (typeof this.fileInput.showPicker === 'function') {
                this.fileInput.showPicker();
            } else {
                this.fileInput.click();
            }
        },
        async onImportUpload() {
            if (this.fileInput.files.length === 0) return;

            const file = this.fileInput.files[0];

            if (
                file.type !== 'application/json'
                && !file.name.toLowerCase().endsWith('.json')
            ) {
                this.showToast('Invalid file.');
                return;
            }

            try {
                const roulette = JSON.parse(await file.text());

                if (!Array.isArray(roulette.levels) || !Array.isArray(roulette.progression)) {
                    this.showToast('Invalid file.');
                    return;
                }

                this.levels = normalizeRouletteLevels(roulette.levels);
                this.progression = roulette.progression;
                this.save();
                this.givenUp = false;
                this.showRemaining = false;
                this.percentage = undefined;
            } catch {
                this.showToast('Invalid file.');
                return;
            }
        },
        onExport() {
            const file = new Blob(
                [JSON.stringify({
                    levels: this.levels,
                    progression: this.progression,
                })],
                { type: 'application/json' },
            );
            const a = document.createElement('a');
            const url = URL.createObjectURL(file);
            a.href = url;
            a.download = 'tsl_roulette.json';
            a.click();
            URL.revokeObjectURL(url);
        },
        showToast(msg) {
            this.toasts.push(msg);
            setTimeout(() => {
                this.toasts.shift();
            }, 3000);
        },
    },
};
