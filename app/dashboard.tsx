import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { io, Socket } from "socket.io-client";
import axios from "axios";
import { api } from "../src/lib/api";
import { colors, radii, spacing } from "../src/theme";
import { AnalyticsWidget } from "../src/components/AnalyticsWidget";

const SOCKET_URL = "http://192.168.0.105:3001";

interface Task {
  id: string;
  title: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  projectId: string;
}

interface Project {
  id: string;
  title: string;
  description?: string;
  tasks: Task[];
}

interface ProjectsResponse {
  data: Project[];
  hasMore: boolean;
}

type SortOption =
  | "createdAt_desc"
  | "createdAt_asc"
  | "title_asc"
  | "title_desc";

const NEXT_STATUS: Record<Task["status"], Task["status"]> = {
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
  COMPLETED: "PENDING",
};

export default function DashboardScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [taskInputs, setTaskInputs] = useState<Record<string, string>>({});
  const [updatingTask, setUpdatingTask] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("createdAt_desc");

  const fetchProjects = useCallback(
    async (pageNumber = 1, currentSort = sortOption) => {
      setLoadingMore(true);
      try {
        const [sortBy, order] = currentSort.split("_");
        const response = await api.get<ProjectsResponse>(
          `/projects?page=${pageNumber}&limit=4&sortBy=${sortBy}&order=${order}`,
        );

        setProjects((prev) =>
          pageNumber === 1
            ? response.data.data
            : [...prev, ...response.data.data],
        );
        setHasMore(response.data.hasMore);
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          await SecureStore.deleteItemAsync("token");
          router.replace("/login");
        } else {
          console.error("Error al obtener proyectos:", error);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [router, sortOption],
  );

  useEffect(() => {
    fetchProjects(1, sortOption);

    const socket: Socket = io(SOCKET_URL, {
      transports: ["websocket"],
    });

    socket.on("taskCreated", (newTask: Task) => {
      setProjects((current) =>
        current.map((project) => {
          if (project.id === newTask.projectId) {
            if (project.tasks.some((t) => t.id === newTask.id)) return project;
            return { ...project, tasks: [...project.tasks, newTask] };
          }
          return project;
        }),
      );
    });

    socket.on("taskUpdated", (updatedTask: Task) => {
      setProjects((current) =>
        current.map((project) =>
          project.id === updatedTask.projectId
            ? {
                ...project,
                tasks: project.tasks.map((task) =>
                  task.id === updatedTask.id ? updatedTask : task,
                ),
              }
            : project,
        ),
      );
    });

    socket.on(
      "taskDeleted",
      (deletedTask: { id: string; projectId: string }) => {
        setProjects((current) =>
          current.map((project) =>
            project.id === deletedTask.projectId
              ? {
                  ...project,
                  tasks: project.tasks.filter(
                    (task) => task.id !== deletedTask.id,
                  ),
                }
              : project,
          ),
        );
      },
    );

    socket.on("projectCreated", (newProject: Project) => {
      setProjects((current) =>
        current.some((p) => p.id === newProject.id)
          ? current
          : [newProject, ...current],
      );
    });

    socket.on("projectDeleted", (deletedProject: { id: string }) => {
      setProjects((current) =>
        current.filter((project) => project.id !== deletedProject.id),
      );
    });

    socket.on("analyticsUpdated", (updatedAnalytics) => {
      DeviceEventEmitter.emit("analyticsUpdatedEvent", updatedAnalytics);
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchProjects, sortOption]);

  const handleSortChange = (newSort: SortOption) => {
    setSortOption(newSort);
    setProjects([]);
    setPage(1);
    fetchProjects(1, newSort);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await fetchProjects(1, sortOption);
  };

  const handleLoadMore = () => {
    if (!hasMore || loadingMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchProjects(nextPage, sortOption);
  };

  const handleCreateProject = async () => {
    if (!newProjectTitle.trim()) return;
    setCreatingProject(true);
    try {
      await api.post("/projects", {
        title: newProjectTitle,
        description: newProjectDesc,
      });
      setNewProjectTitle("");
      setNewProjectDesc("");
      setPage(1);
      await fetchProjects(1, sortOption);
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setCreatingProject(false);
    }
  };

  const handleCreateTask = async (projectId: string) => {
    const title = taskInputs[projectId];
    if (!title?.trim()) return;
    try {
      await api.post("/tasks", { title, projectId });
      setTaskInputs((current) => ({ ...current, [projectId]: "" }));
    } catch (error) {
      console.error("Failed to create task:", error);
    }
  };

  const handleStatusChange = async (taskId: string, status: Task["status"]) => {
    const nextStatus = NEXT_STATUS[status];
    setUpdatingTask(taskId);

    const targetProject = projects.find((p) =>
      p.tasks.some((t) => t.id === taskId),
    );

    if (targetProject) {
      DeviceEventEmitter.emit("analyticsLoadingEvent", {
        projectId: targetProject.id,
      });
    }

    // Actualización optimista de tareas
    setProjects((current) =>
      current.map((project) => ({
        ...project,
        tasks: project.tasks.map((task) =>
          task.id === taskId ? { ...task, status: nextStatus } : task,
        ),
      })),
    );

    try {
      await api.patch(`/tasks/${taskId}`, { status: nextStatus });
    } catch (error) {
      console.error("Failed to update task status:", error);
      fetchProjects(1, sortOption);
    } finally {
      setUpdatingTask(null);
    }
  };

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync("token");
    router.replace("/login");
  };

  const renderHeader = () => (
    <View>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Tu espacio de trabajo</Text>
          <Text style={styles.title}>Proyectos</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nuevo Proyecto</Text>
        <TextInput
          style={styles.input}
          placeholder="Título del proyecto *"
          placeholderTextColor={colors.textMuted}
          value={newProjectTitle}
          onChangeText={setNewProjectTitle}
        />
        <TextInput
          style={styles.input}
          placeholder="Descripción (opcional)"
          placeholderTextColor={colors.textMuted}
          value={newProjectDesc}
          onChangeText={setNewProjectDesc}
        />
        <TouchableOpacity
          style={styles.accentButton}
          onPress={handleCreateProject}
          disabled={creatingProject}
        >
          {creatingProject ? (
            <ActivityIndicator color={colors.backgroundDeep} />
          ) : (
            <Text style={styles.accentButtonText}>+ Crear Proyecto</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.sortContainer}>
        <Text style={styles.sortLabel}>Orden:</Text>
        <TouchableOpacity
          style={[
            styles.sortChip,
            sortOption === "createdAt_desc" && styles.sortChipActive,
          ]}
          onPress={() => handleSortChange("createdAt_desc")}
        >
          <Text style={styles.sortChipText}>Recientes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sortChip,
            sortOption === "createdAt_asc" && styles.sortChipActive,
          ]}
          onPress={() => handleSortChange("createdAt_asc")}
        >
          <Text style={styles.sortChipText}>Antiguos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sortChip,
            sortOption === "title_asc" && styles.sortChipActive,
          ]}
          onPress={() => handleSortChange("title_asc")}
        >
          <Text style={styles.sortChipText}>A-Z</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sortChip,
            sortOption === "title_desc" && styles.sortChipActive,
          ]}
          onPress={() => handleSortChange("title_desc")}
        >
          <Text style={styles.sortChipText}>Z-A</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(project) => project.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          bounces
          alwaysBounceVertical
          overScrollMode="always"
          onRefresh={handleRefresh}
          refreshing={refreshing}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={renderHeader()}
          ListFooterComponent={renderFooter()}
          renderItem={({ item: project }) => (
            <View style={styles.card}>
              <Text style={styles.projectTitle}>{project.title}</Text>
              <Text style={styles.description}>
                {project.description || "Sin descripción"}
              </Text>

              <AnalyticsWidget
                projectId={project.id}
                tasksCount={project.tasks.length}
              />

              <View style={styles.taskInputRow}>
                <TextInput
                  style={[styles.input, styles.taskInput]}
                  placeholder="Nueva tarea..."
                  placeholderTextColor={colors.textMuted}
                  value={taskInputs[project.id] || ""}
                  onChangeText={(title) =>
                    setTaskInputs((current) => ({
                      ...current,
                      [project.id]: title,
                    }))
                  }
                />
                <TouchableOpacity
                  style={styles.taskButton}
                  onPress={() => handleCreateTask(project.id)}
                >
                  <Text style={styles.taskButtonText}>+ Tarea</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />
              <Text style={styles.tasksHeader}>
                TAREAS ({project.tasks.length})
              </Text>

              {project.tasks.length === 0 ? (
                <Text style={styles.emptyTasks}>Sin tareas asignadas</Text>
              ) : (
                project.tasks.map((task) => (
                  <View key={task.id} style={styles.taskRow}>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    <TouchableOpacity
                      disabled={updatingTask === task.id}
                      onPress={() => handleStatusChange(task.id, task.status)}
                    >
                      {updatingTask === task.id ? (
                        <ActivityIndicator size="small" color="#38bdf8" />
                      ) : (
                        <Text
                          style={[
                            styles.badge,
                            task.status === "COMPLETED"
                              ? styles.badgeCompleted
                              : task.status === "IN_PROGRESS"
                                ? styles.badgeInProgress
                                : styles.badgePending,
                          ]}
                        >
                          {task.status} ↺
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyList}>No hay proyectos disponibles</Text>
          }
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundDeep,
  },
  listContent: {
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.screen,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.top,
    marginBottom: spacing.screen,
  },
  eyebrow: {
    fontSize: 11,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  title: { fontSize: 24, fontWeight: "bold", color: colors.text },
  logoutButton: {
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.control,
  },
  logoutText: { color: colors.textSoft, fontWeight: "600", fontSize: 13 },
  card: {
    backgroundColor: colors.surfaceMuted,
    padding: spacing.section,
    borderRadius: radii.card,
    marginBottom: spacing.screen,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  input: {
    backgroundColor: colors.backgroundDeep,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
    fontSize: 14,
    marginBottom: 10,
  },
  accentButton: {
    backgroundColor: colors.accent,
    paddingVertical: 10,
    borderRadius: radii.control,
    alignItems: "center",
    marginTop: 4,
  },
  accentButtonText: {
    color: colors.backgroundDeep,
    fontWeight: "bold",
    fontSize: 14,
  },
  projectTitle: { color: colors.text, fontSize: 18, fontWeight: "bold" },
  description: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
    marginBottom: 12,
  },
  taskInputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  taskInput: { flex: 1, marginBottom: 0, height: 40 },
  taskButton: {
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    height: 40,
    justifyContent: "center",
    borderRadius: radii.control,
  },
  taskButtonText: { color: colors.text, fontWeight: "600", fontSize: 13 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  tasksHeader: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 8,
  },
  taskRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceDark,
    padding: 10,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  taskTitle: { color: "#e2e8f0", fontSize: 13, flex: 1, marginRight: 8 },
  badge: {
    fontSize: 10,
    fontWeight: "bold",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeCompleted: {
    backgroundColor: "rgba(20, 184, 166, 0.2)",
    color: "#2dd4bf",
  },
  badgeInProgress: {
    backgroundColor: "rgba(234, 179, 8, 0.2)",
    color: "#facc15",
  },
  badgePending: {
    backgroundColor: "rgba(148, 163, 184, 0.2)",
    color: colors.textMuted,
  },
  emptyTasks: { color: "#475569", fontSize: 12, fontStyle: "italic" },
  emptyList: { color: colors.textMuted, textAlign: "center", marginTop: 40 },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
  },
  sortContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.screen,
    gap: 8,
  },
  sortLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "bold",
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.control,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  sortChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
});
