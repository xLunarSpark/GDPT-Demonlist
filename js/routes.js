import List from './pages/List.js';

// Lazy loading
export default [
    { path: '/', component: List },
    { path: '/leaderboard', component: () => import('./pages/Leaderboard.js') },
    { path: '/roulette', component: () => import('./pages/Roulette.js') },
];
