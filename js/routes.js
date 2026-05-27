import List from './pages/List.js';

// Lazy loading
export default [
    { path: '/', component: List },
    { path: '/leaderboard', component: () => import('./pages/Leaderboard.js') },
    { path: '/roulette', component: () => import('./pages/Roulette.js') },
    { path: '/profile', component: () => import('./pages/Profile.js') },
    { path: '/map', component: () => import('./pages/Map.js') },
];
