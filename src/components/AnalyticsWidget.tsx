import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  DeviceEventEmitter,
} from "react-native";
import { api } from "../lib/api";
import { colors } from "../theme";

interface ProjectAnalytics {
  project_id: string;
  completion_rate: number;
  status: string;
  health: string;
  total_tasks?: number;
}

interface Props {
  projectId: string;
  tasksCount: number;
}

export function AnalyticsWidget({ projectId, tasksCount }: Props) {
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await api.get<ProjectAnalytics>(
        `/projects/${projectId}/analytics`,
      );
      setAnalytics(response.data);
    } catch (error) {
      console.error("Error al obtener analíticas:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchAnalytics();

    // 1. Escuchar evento de inicio de carga al modificar una tarea
    const loadingSub = DeviceEventEmitter.addListener(
      "analyticsLoadingEvent",
      (data: { projectId: string }) => {
        if (data.projectId === projectId) {
          setLoading(true);
        }
      },
    );

    // 2. Escuchar evento de analíticas actualizadas por WebSocket
    const updateSub = DeviceEventEmitter.addListener(
      "analyticsUpdatedEvent",
      (data: ProjectAnalytics) => {
        if (data.project_id === projectId) {
          setAnalytics(data);
          setLoading(false);
        }
      },
    );

    return () => {
      loadingSub.remove();
      updateSub.remove();
    };
  }, [fetchAnalytics, projectId, tasksCount]);

  if (loading || !analytics) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.loadingText}>Calculando...</Text>
      </View>
    );
  }

  const getHealthStyle = (health: string) => {
    switch (health) {
      case "EXCELLENT":
      case "GOOD":
        return {
          badge: styles.badgeGood,
          text: styles.textGood,
        };
      case "NEEDS ATTENTION":
        return {
          badge: styles.badgeAttention,
          text: styles.textAttention,
        };
      case "NO TASKS":
        return {
          badge: styles.badgeNoTasks,
          text: styles.textNoTasks,
        };
      default:
        return {
          badge: styles.badgeDefault,
          text: styles.textDefault,
        };
    }
  };

  const healthStyle = getHealthStyle(analytics.health);

  return (
    <View style={styles.container}>
      {tasksCount > 0 && (
        <>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${analytics.completion_rate}%` },
              ]}
            />
          </View>
          <Text style={styles.rateText}>
            {Math.round(analytics.completion_rate)}%
          </Text>
        </>
      )}

      <View style={[styles.badge, healthStyle.badge]}>
        <Text style={[styles.badgeText, healthStyle.text]}>
          {analytics.health}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginVertical: 6,
  },
  loadingText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: colors.surfaceDark,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.accent,
  },
  rateText: {
    fontSize: 11,
    color: colors.textSoft,
    fontWeight: "bold",
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeGood: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  badgeAttention: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  badgeNoTasks: {
    backgroundColor: "rgba(14, 165, 233, 0.1)",
    borderColor: "rgba(14, 165, 233, 0.3)",
  },
  badgeDefault: {
    backgroundColor: "rgba(148, 163, 184, 0.1)",
    borderColor: "rgba(148, 163, 184, 0.3)",
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "bold",
  },
  textGood: {
    color: "#4ade80",
  },
  textAttention: {
    color: "#fbbf24",
  },
  textNoTasks: {
    color: "#38bdf8",
  },
  textDefault: {
    color: colors.textMuted,
  },
});
