import StandardView from "@/components/standard-view";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuthStore } from "@/store/useAuthStore";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import { Users as UsersIcon } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

export default function ProducersScreen() {
    const { isAdmin } = useAuthStore();

    if (!isAdmin()) return null;

    return (
        <StandardView
            headerBackgroundColor={{ light: "#2ecc71", dark: "#0a1a10" }}
            headerTitle="Productores"
        >
            <ThemedView style={styles.container}>
                <View style={styles.center}>
                    <UsersIcon size={responsiveFont(48)} color="#2ecc71" />
                    <ThemedText type="title" style={styles.title}>Gestión de Productores</ThemedText>
                    <ThemedText style={styles.subtitle}>
                        Próximamente: Listado y registro de productores agropecuarios.
                    </ThemedText>
                </View>
            </ThemedView>
        </StandardView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: verticalScale(100),
        paddingHorizontal: widthScale(20),
    },
    title: {
        marginTop: verticalScale(20),
        textAlign: 'center',
        fontSize: responsiveFont(24),
    },
    subtitle: {
        marginTop: verticalScale(8),
        textAlign: 'center',
        opacity: 0.6,
    },
});
