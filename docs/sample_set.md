# Sample Set (Prompt Examples)

These examples are best used as prompt demonstrations, not as training data.
For training-grade data, use the JSONL template in `docs/training_template.jsonl`.

Sample 1
Category: Performance
Input Commit: "Created a cache in order to increase the efficiency of loading x, decreased the time to load from y to z"

Output Comment: "This change streamlines cache access paths in the payments API, improving response time during peak checkout traffic."
---
Sample 2
Category: Cost
Input Commit: "Decreased the size of queries on the system from x to y"

Output Comment: "Decreased cost of API calls by x"
---
Sample 3
Category: UX
Input Commit: "Created error response when user does x"

Output Comment: "Improved UX by creating dynamic responses to user action"
---
Sample 4
Category: Scalability
Input Commit: "Switched to online hosting to allow for more users"

Output Comment: "Users should now experience lower wait times and smoother experiences"
---
Sample 5
Category: Security
Input Commit: "Moved secrets out of being hardcoded, now in .env file"

Output Comment: "Increased backend security to prevent company secrets from being shared"
