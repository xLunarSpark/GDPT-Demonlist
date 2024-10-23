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
    if (rank > 75 && percent < 100) {
        return 0;  // Levels above rank 75 only get points if completed 100%
    }
    // Cálculo Base da Pontuação

    let baseScore;

    if (rank <= 5) {
       baseScore = (-33 * Math.pow(rank - 1, 0.65) + 500);
    } if (rank > 5 && rank <= 15) {  // Use 'else' to avoid redundant checks
       baseScore = (-14.44 * rank +466.64);
    } if (rank > 15 && rank <= 30) {  // Use 'else' to avoid redundant checks
       baseScore = (-5 * rank + 310 );
    }
    // Fator de completude da percentagem, ajustando para ser mais gradual
    let percentCompletionFactor = (percent - (minPercent - 1)) / (100 - (minPercent - 1));
    // Garantir que o fator não é negativo
    percentCompletionFactor = Math.max(0, percentCompletionFactor);
    // Pontuação ajustada com o fator de completude
    let score = baseScore * percentCompletionFactor;
    // Assegurar que a pontuação é positiva
    score = Math.max(0, score);
    // Se a percentagem não for 100%, reduzir a pontuação em um terço
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
