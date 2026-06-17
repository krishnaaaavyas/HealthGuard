export interface ProjectionAssumptions {
  days30: Record<string, any>;
  days90: Record<string, any>;
  days180: Record<string, any>;
}

export const projectionRules: Record<string, ProjectionAssumptions> = {
  exercise_30_min: {
    days30: { exercise: "moderate" },
    days90: { exercise: "active" },
    days180: { exercise: "active" },
  },
  quit_smoking: {
    days30: { smoking: "former" },
    days90: { smoking: "never" },
    days180: { smoking: "never" },
  },
  limit_alcohol: {
    days30: { alcohol: "occasional" },
    days90: { alcohol: "never" },
    days180: { alcohol: "never" },
  },
};
