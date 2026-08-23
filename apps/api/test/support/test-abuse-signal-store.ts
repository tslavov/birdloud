import type { AbuseSignalStore } from "../../src/services/abuse-signals.js";

export const availableAbuseSignalStore: AbuseSignalStore = {
  async observeVote() {
    return {
      available: true,
      recentIpSubmissions: 1,
      recentDeviceSubmissions: 1,
      recentIpFailures: 0,
      recentDeviceFailures: 0
    };
  },
  async recordFailure() {}
};
