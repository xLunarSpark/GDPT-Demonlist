/**
 * Numbers of decimal digits to round to
 */
const scale = 3;

/**
 * Calculate the score awarded when having a certain percentage on a list level
 * @param {Number} rank Position on the list
 * @param {Number} percent Percentage of completion
 * @param {Number} minPercent Minimum percentage required
 * @returns {Number}
 */
export function score(rank, percent, minPercent) {
    if (rank > 150) {
        return 0;  // No points for ranks beyond 150
    }

    // Restrição corrigida: Apenas aplicar se o rank for acima de 75 e a percentagem < 100
    if (rank > 75 && percent < 100) {
        return 0;  // No points for levels above rank 75 unless it's 100%
    }

    // New adjusted formula
    let baseScore = (-25 * Math.pow(rank - 1, 0.4) + 200);  // Base score calculation

    // Calculate adjusted percentage weight
    let percentCompletionFactor = ((percent - minPercent) / (100 - minPercent));

    // Half points for 99%
    if (percent === 99) {
        percentCompletionFactor = 0.5;
    }

    let score = baseScore * percentCompletionFactor;

    // Ensure score is non-negative
    score = Math.max(0, score);

    // If not 100%, reduce by one third
    if (percent !== 100) {
        return round(score - score / 3);
    }

    return round(score);
}

export function round(num) {
    if (!('' + num).includes('e')) {
        return +(Math.round(num + 'e+' + scale) + 'e-' + scale);
    } else {
        var arr = ('' + num).split('e');
        var sig = '';
        if (+arr[1] + scale > 0) {
            sig = '+';
        }
        return +(
            Math.round(+arr[0] + 'e' + sig + (+arr[1] + scale)) +
            'e-' +
            scale
        );
    }
}
