import StandardView from "@/components/standard-view";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/utils/api";
import { heightPercent, responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import { BlurView } from "expo-blur";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    Briefcase,
    ChevronLeft,
    Edit,
    Folder,
    User as UserIcon
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View
} from "react-native";

interface ProjectUser {
    id: number;
    username: string;
    role: string;
    role_id: number;
}

interface Project {
    id: number;
    nombre: string;
    id_mga: string;
    municipios: string;
    id_tipo_proyecto: string;
}

export default function ProjectDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { currentRole } = useAuthStore();
    const isAdmin = currentRole === 1;

    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchProjectDetails = React.useCallback(async () => {
        try {
            setLoading(true);
            const response: any = await apiFetch(`/projects/${id}`);
            setProject(response.data);
        } catch (error) {
            console.error("Failed to fetch project details:", error);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchProjectDetails();
    }, [fetchProjectDetails]);

    return (
        <StandardView headerTitle="Detalle del Proyecto" noScroll>
            {loading ? (
                <View style={[styles.center, { height: heightPercent(70) }]}>
                    <ActivityIndicator size="large" color="#2ecc71" />
                </View>
            ) : project ? (
                <ScrollView
                    style={styles.container}
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                >
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <ChevronLeft size={responsiveFont(24)} color="#2ecc71" />
                        <ThemedText style={styles.backText}>Volver</ThemedText>
                    </TouchableOpacity>

                    <BlurView intensity={20} tint="light" style={styles.headerCard}>
                        <View style={styles.iconContainer}>
                            <Folder size={responsiveFont(32)} color="#2ecc71" />
                        </View>
                        <ThemedText type="subtitle" style={styles.projectName}>
                            {project.nombre}
                        </ThemedText>
                        <ThemedText style={styles.projectId}>
                            MGA ID: {project.id_mga}
                        </ThemedText>
                    </BlurView>

                    <ThemedView style={styles.infoSection}>
                        <View style={styles.infoRow}>
                            <UserIcon size={responsiveFont(20)} color="#2ecc71" />
                            <View>
                                <ThemedText type="defaultSemiBold">Municipios</ThemedText>
                                <ThemedText style={styles.infoValue}>{project.municipios || 'N/A'}</ThemedText>
                            </View>
                        </View>

                        <View style={styles.infoRow}>
                            <Briefcase size={responsiveFont(20)} color="#2ecc71" />
                            <View>
                                <ThemedText type="defaultSemiBold">Tipo de Proyecto</ThemedText>
                                <ThemedText style={styles.infoValue}>{project.id_tipo_proyecto || 'S/N'}</ThemedText>
                            </View>
                        </View>
                    </ThemedView>

                    {isAdmin && (
                        <View style={styles.adminActions}>
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => router.push(`/project/edit/${id}`)}
                            >
                                <Edit size={responsiveFont(20)} color="white" />
                                <ThemedText style={styles.actionText}>Editar Proyecto</ThemedText>
                            </TouchableOpacity>
                        </View>
                    )}

                    <View style={{ height: verticalScale(100) }} />
                </ScrollView>
            ) : (
                <View style={styles.center}>
                    <ThemedText>Proyecto no encontrado</ThemedText>
                </View>
            )}
        </StandardView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        paddingBottom: verticalScale(40),
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: verticalScale(16),
    },
    backText: {
        color: '#2ecc71',
        fontWeight: '700',
        fontSize: responsiveFont(16),
    },
    headerCard: {
        padding: widthScale(24),
        borderRadius: widthScale(24),
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        alignItems: 'center',
        marginBottom: verticalScale(24),
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    iconContainer: {
        width: widthScale(64),
        height: widthScale(64),
        borderRadius: widthScale(20),
        backgroundColor: 'rgba(46, 204, 113, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: verticalScale(16),
    },
    projectName: {
        textAlign: 'center',
        fontSize: responsiveFont(24),
    },
    projectId: {
        marginTop: verticalScale(4),
        opacity: 0.5,
        fontSize: responsiveFont(14),
    },
    infoSection: {
        gap: verticalScale(20),
        padding: widthScale(16),
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: widthScale(16),
    },
    infoValue: {
        fontSize: responsiveFont(15),
        opacity: 0.7,
        marginTop: verticalScale(2),
    },
    adminActions: {
        marginTop: verticalScale(32),
        paddingHorizontal: widthScale(16),
        gap: verticalScale(12),
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2ecc71',
        padding: widthScale(16),
        borderRadius: widthScale(16),
        gap: widthScale(10),
    },
    actionText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: responsiveFont(16),
    },
});
