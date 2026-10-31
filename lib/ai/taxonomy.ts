// Fixed tag sets the AI pass assigns to every headline (UI labels live in messages/*.json).

export const REGIONS = ["vietnam", "asia", "europe", "americas", "middle-east", "africa", "oceania", "global"] as const;
export const TOPICS = ["politics", "conflict", "economy", "markets", "business", "tech", "science", "climate", "health", "society", "sports", "other"] as const;
export type Region = (typeof REGIONS)[number];
export type Topic = (typeof TOPICS)[number];
