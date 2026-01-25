import { Link, Stack } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { verticalScale, widthScale } from '@/utils/responsive';

export default function NotFoundScreen() {
    return (
        <>
            <Stack.Screen options={{ title: 'Oops!' }} />
            <ThemedView style={styles.container}>
                <ThemedText type="title">Esta pantalla no existe.</ThemedText>
                <Link href="/" style={styles.link}>
                    <ThemedText type="link">¡Volver al inicio!</ThemedText>
                </Link>
            </ThemedView>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: widthScale(20),
    },
    link: {
        marginTop: verticalScale(15),
        paddingVertical: verticalScale(15),
    },
});
