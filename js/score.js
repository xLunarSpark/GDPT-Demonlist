# Modifying the score function to match the observed graph

def updated_score(rank, percent, minPercent):
    if rank > 150:
        return 0  # No points for ranks beyond 150
    if rank > 75 and percent < 100:
        return 0  # Levels above rank 75 only get points if completed 100%

    # Adjusting the base score calculation to fit the curve from the image
    baseScore = (-40 * (rank - 1) ** 0.45 + 350)  # Adjusted formula to fit the observed curve

    # Percentage completion factor, adjusted
    percentCompletionFactor = (percent - (minPercent - 1)) / (100 - (minPercent - 1))
    
    # Ensure factor is not negative
    percentCompletionFactor = max(0, percentCompletionFactor)

    # Adjusted score with completion factor
    adjusted_score = baseScore * percentCompletionFactor

    # Ensure score is non-negative
    adjusted_score = max(0, adjusted_score)

    # Reduce score by one-third if percentage is not 100%
    if percent != 100:
        return round_num(adjusted_score - adjusted_score / 3)

    return round_num(adjusted_score)

# Prepare data for visualization using the updated formula
ranks = np.arange(1, 151)
percent = 100
min_percent = 50

updated_scores = [updated_score(rank, percent, min_percent) for rank in ranks]

# Define the position to annotate
position_to_annotate = 50
updated_score_at_position = updated_score(position_to_annotate, percent, min_percent)

# Plotting the graph with a dark background and red curve
plt.style.use('dark_background')
plt.figure(figsize=(10, 6))

# Plot the updated score curve
plt.plot(ranks, updated_scores, label=f'Percent = {percent}, MinPercent = {min_percent}', color='red', linestyle='-')

# Annotate the specific position
plt.text(position_to_annotate, updated_score_at_position + 5, f'Pos:{position_to_annotate}, Score:{updated_score_at_position}', color='white')

# Customize the look of the graph
plt.title('Updated Score vs Rank', color='white')
plt.xlabel('Rank', color='white')
plt.ylabel('Score', color='white')
plt.grid(True, color='gray', linestyle='--')
plt.xticks(color='white')
plt.yticks(color='white')
plt.ylim(0, 350)

# Show the final graph
plt.show()
