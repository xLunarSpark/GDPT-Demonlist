/**
 * Numbers of decimal digits to round to
 */
const scale = 3;

/**
 * Calculate the score awarded when having a certain percentage on a list level
 * @param {Number} rank Position on the list
 * @param {Number} percent Percentage of completion (optional)
 * @param {Number} minPercent Minimum percentage required
 * @param {Boolean} isForLeaderboard Flag to indicate if the calculation is for leaderboard
 * @returns {Number}
 */
export function score(rank, percent, minPercent, isForLeaderboard = true) {
    if (rank > 150) {
        return 0;  // No points for ranks beyond 150
    }

    // Para a leaderboard: Níveis de 76 a 150 só recebem pontos para 100%
    if (isForLeaderboard && rank > 75) {
        if (percent < 100) {
            return 0;  // Níveis acima de 75 só recebem pontos se for 100%
        }
    }

    // Cálculo Base da Pontuação
    let baseScore = (-25 * Math.pow(rank - 1, 0.4) + 200);  // Base score calculation

    // Verificar se minPercent é 100%
    let percentCompletionFactor;
    if (minPercent === 100) {
        // Somente 100% dá pontos
        percentCompletionFactor = (percent === 100) ? 1 : 0;
    } else {
        // Calcular o fator de conclusão normal
        percentCompletionFactor = ((percent - minPercent) / (100 - minPercent));
    }

    // Half points for 99%
    if (percent === 99) {
        percentCompletionFactor = 0.5;
    }

    let score = baseScore * percentCompletionFactor;

    // Assegurar que a pontuação é positiva
    score = Math.max(0, score);

    // Para leaderboard: se não for 100%, reduzir a pontuação em um terço
    if (isForLeaderboard && percent !== 100) {
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
