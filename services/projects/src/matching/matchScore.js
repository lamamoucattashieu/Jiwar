// Scores a trainee for a project with the model trained in ml/train.py
// (story #24). Logistic regression: standardise each feature the same way as
// in training, take the weighted sum, squash it to a 0..1 likelihood.
// The score only orders the list; the admin still chooses.
import { readFileSync } from 'node:fs';

const MODEL = JSON.parse(readFileSync(new URL('./model.json', import.meta.url), 'utf8'));

// In training, 0 means "no projects yet". A trainee with completed projects that
// no business rated gets this neutral value instead: 0 would read as terrible work.
export const NEUTRAL_RATING = 3.5;

/** The model's features from what learning and projects know about a trainee. */
export function featuresFor({ eligibility, stats, levelRequired, preferred }) {
  const projectsCompleted = eligibility.projectsCompleted ?? 0;
  const avgRating = stats.avgRating || (projectsCompleted > 0 ? NEUTRAL_RATING : 0);
  return {
    level_margin: Math.max(0, eligibility.level - levelRequired),
    credits: (eligibility.credits ?? 0) / 100,
    projects_completed: projectsCompleted,
    avg_rating: avgRating,
    active_projects: stats.activeProjects ?? 0,
    preferred: preferred ? 1 : 0,
  };
}

export function matchScore(features, model = MODEL) {
  const z = model.features.reduce(
    (sum, name, i) => sum + model.weights[i] * ((features[name] - model.mean[i]) / model.std[i]),
    model.intercept,
  );
  return 1 / (1 + Math.exp(-z));
}

export const MODEL_INFO = { version: MODEL.version, auc: MODEL.metrics.auc, trainedOn: MODEL.trained_on };
