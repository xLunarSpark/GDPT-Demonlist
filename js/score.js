/**
 * Numbers of decimal digits to round to
 */
const scale = 3;
const MAX_RANK_WITH_POINTS = 150;
const FULL_CLEAR_REQUIRED_AFTER = 75;

function getBaseScore(rank) {
    if (rank <= 5) {
        return -33 * Math.pow(rank - 1, 0.65) + 500;
    }
    if (rank <= 15) {
        return -14.44 * rank + 466.64;
    }
    if (rank <= 30) {
        return -5 * rank + 310;
    }
    if (rank <= 50) {
        return -4.474 * rank + 290.7;
    }
    if (rank <= 75) {
        return -0.958 * rank + 113.858;
    }
    if (rank <= 85) {
        return -0.556 * rank + 82.256;
    }
    if (rank <= 115) {
        return -0.367 * rank + 65.195;
    }
    return -0.486 * rank + 77.79;
}

/**
 * Calculate the score awarded when having a certain percentage on a list level
 * @param {Number} rank Position on the list
 * @param {Number} percent Percentage of completion
 * @param {Number} minPercent Minimum percentage required
 * @returns {Number}
 */
export function score(rank, percent, minPercent) {
    if (rank > MAX_RANK_WITH_POINTS) {
        return 0;
    }
    if (rank > FULL_CLEAR_REQUIRED_AFTER && percent < 100) {
        return 0;
    }

    const baseScore = getBaseScore(rank);
    const threshold = minPercent - 1;
    const completionFactor = Math.max(0, (percent - threshold) / (100 - threshold));
    const adjustedScore = Math.max(0, baseScore * completionFactor);
    const finalScore = percent === 100 ? adjustedScore : adjustedScore * (2 / 3);

    return round(finalScore);
}

export function round(num) {
    const stringified = String(num);
    if (!stringified.includes('e')) {
        return +(Math.round(`${num}e+${scale}`) + `e-${scale}`);
    }

    const [coefficient, exponent] = stringified.split('e');
    const shiftedExponent = Number(exponent) + scale;
    const sign = shiftedExponent > 0 ? '+' : '';

    return +(
        Math.round(`${Number(coefficient)}e${sign}${shiftedExponent}`)
        + `e-${scale}`
    );
}
