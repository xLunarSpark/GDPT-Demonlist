import Spinner from '../components/Spinner.js';
import { store } from '../main.js';

const REGIONS = [
    'Viana do Castelo',
    'Braga',
    'Vila Real',
    'Braganca',
    'Porto',
    'Aveiro',
    'Viseu',
    'Guarda',
    'Coimbra',
    'Castelo Branco',
    'Leiria',
    'Santarem',
    'Lisboa',
    'Setubal',
    'Portalegre',
    'Evora',
    'Beja',
    'Faro',
];

export default {
    components: { Spinner },
    data: () => ({
        store,
        regions: REGIONS,
        loading: true,
        saving: false,
        saveMessage: '',
        saveType: 'info',
        profile: {
            gd_name: '',
            region: '',
        },
        submissions: [],
        submissionsLoading: false,
        submissionsError: '',
    }),
    computed: {
        loggedIn() {
            return this.store.auth.loggedIn;
        },
        discordName() {
            return this.store.auth.username || 'Unknown';
        },
    },
    template: `
        <main class="page-profile">
            <div class="profile-shell">
                <div class="profile-hero">
                    <div>
                        <h1 class="type-title-lg">Profile</h1>
                        <p class="type-body-md">Manage your GD name, region, and track submissions.</p>
                    </div>
                    <div class="profile-hero-tag" v-if="loggedIn">
                        <span class="type-label-lg">Logged in as</span>
                        <strong class="type-title-sm">{{ discordName }}</strong>
                    </div>
                </div>

                <div v-if="loading" class="profile-loading">
                    <Spinner></Spinner>
                </div>

                <div v-else>
                    <div v-if="!loggedIn" class="profile-card profile-login">
                        <h2 class="type-title-sm">Login Required</h2>
                        <p class="type-body-md">Sign in with Discord to access your profile and submission status.</p>
                        <a class="btn profile-login-btn" href="/auth/login?redirect=/#/profile">
                            <img src="/assets/discord.svg" alt="" aria-hidden="true" />
                            <span>Continue with Discord</span>
                        </a>
                    </div>

                    <div v-else class="profile-grid">
                        <section class="profile-card">
                            <h2 class="type-title-sm">Your Details</h2>
                            <form @submit.prevent="saveProfile">
                                <label class="type-label-lg">GD Username</label>
                                <input
                                    v-model="profile.gd_name"
                                    type="text"
                                    placeholder="Your GD username"
                                    required
                                />

                                <label class="type-label-lg">District</label>
                                <select v-model="profile.region" required>
                                    <option disabled value="">Select a district</option>
                                    <option v-for="region in regions" :key="region" :value="region">{{ region }}</option>
                                </select>

                                <button class="btn profile-save-btn" type="submit" :disabled="saving">
                                    {{ saving ? 'Saving...' : 'Save Profile' }}
                                </button>
                            </form>
                            <p v-if="saveMessage" class="profile-status" :class="'profile-status--' + saveType">
                                {{ saveMessage }}
                            </p>
                        </section>

                        <section class="profile-card">
                            <h2 class="type-title-sm">Submission Status</h2>
                            <div v-if="submissionsLoading" class="profile-loading">
                                <Spinner></Spinner>
                            </div>
                            <div v-else>
                                <p v-if="submissionsError" class="profile-error">{{ submissionsError }}</p>
                                <p v-else-if="submissions.length === 0" class="type-body-md">No submissions yet.</p>
                                <div v-else class="profile-submissions">
                                    <div v-for="sub in submissions" :key="sub.id" class="profile-submission">
                                        <div class="submission-header">
                                            <div>
                                                <p class="type-label-lg">{{ sub.player }} on {{ sub.level }}</p>
                                                <p class="type-body-md">{{ sub.percent }}% at {{ sub.hz }} hz</p>
                                            </div>
                                            <span class="submission-status" :class="'status-' + sub.status">{{ formatStatus(sub.status) }}</span>
                                        </div>
                                        <p class="type-body-md submission-meta">Submitted {{ formatDate(sub.timestamp) }}</p>
                                        <p v-if="sub.status !== 'pending'" class="type-body-md submission-meta">Reviewed {{ formatDate(sub.reviewed_at) }}</p>
                                        <p v-if="sub.review_reason" class="type-body-md submission-reason">Reason: {{ sub.review_reason }}</p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    `,
    async mounted() {
        if (!this.loggedIn) {
            this.loading = false;
            return;
        }

        await Promise.all([this.loadProfile(), this.loadSubmissions()]);
        this.loading = false;
    },
    methods: {
        formatStatus(value) {
            if (!value) return 'Pending';
            return value.charAt(0).toUpperCase() + value.slice(1);
        },
        formatDate(value) {
            if (!value) return 'Unknown';
            const parsed = new Date(value);
            if (Number.isNaN(parsed.getTime())) return 'Unknown';
            return parsed.toLocaleString();
        },
        async loadProfile() {
            try {
                const res = await fetch('/api/profile');
                if (!res.ok) {
                    throw new Error('Failed to load profile');
                }

                const data = await res.json();
                const profile = data?.profile;

                if (profile?.gd_name) {
                    this.profile.gd_name = profile.gd_name;
                } else if (data?.linked_gd_name) {
                    this.profile.gd_name = data.linked_gd_name;
                } else if (data?.discord_username) {
                    this.profile.gd_name = data.discord_username;
                }

                if (profile?.region) {
                    this.profile.region = this.regions.includes(profile.region)
                        ? profile.region
                        : '';
                }
            } catch (e) {
                this.saveMessage = e?.message || 'Failed to load profile.';
                this.saveType = 'error';
            }
        },
        async saveProfile() {
            this.saveMessage = '';
            this.saveType = 'info';
            this.saving = true;

            try {
                const res = await fetch('/api/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        gd_name: this.profile.gd_name,
                        region: this.profile.region,
                    }),
                });

                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(text || 'Failed to save profile');
                }

                this.saveMessage = 'Profile updated.';
                this.saveType = 'success';
            } catch (e) {
                this.saveMessage = e?.message || 'Failed to save profile.';
                this.saveType = 'error';
            } finally {
                this.saving = false;
            }
        },
        async loadSubmissions() {
            this.submissionsLoading = true;
            this.submissionsError = '';

            try {
                const res = await fetch('/api/submissions?mine=1');
                if (!res.ok) {
                    throw new Error('Failed to load submissions');
                }

                const data = await res.json();
                this.submissions = Array.isArray(data) ? data : [];
            } catch (e) {
                this.submissionsError = e?.message || 'Failed to load submissions.';
            } finally {
                this.submissionsLoading = false;
            }
        },
    },
};
