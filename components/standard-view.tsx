import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { heightPercent, responsiveFont, verticalScale, widthScale } from '@/utils/responsive';
import type { PropsWithChildren, ReactElement } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = PropsWithChildren<{
    headerImage?: ReactElement;
    headerBackgroundColor: { dark: string; light: string };
    headerTitle?: string;
    noScroll?: boolean;
}>;

export default function StandardView({
    children,
    headerImage,
    headerBackgroundColor,
    headerTitle,
    noScroll = false,
}: Props) {
    const backgroundColor = useThemeColor({}, 'background');
    const colorScheme = useColorScheme() ?? 'light';

    return (
        <ThemedView style={[styles.container, { backgroundColor }]}>
            <View style={[styles.header, { backgroundColor: headerBackgroundColor[colorScheme] }]}>
                <SafeAreaView edges={['top']} style={styles.safeArea}>
                    <View style={styles.headerContent}>
                        {headerTitle && (
                            <ThemedText type="title" style={styles.title}>
                                {headerTitle}
                            </ThemedText>
                        )}
                        {headerImage}
                    </View>
                </SafeAreaView>
            </View>
            {noScroll ? (
                <View style={[styles.scrollView, styles.content]}>
                    {children}
                </View>
            ) : (
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                >
                    {children}
                    <View style={{ height: verticalScale(100) }} />
                </ScrollView>
            )}
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        height: heightPercent(10),
        minHeight: 100,
        justifyContent: 'flex-end',
    },
    safeArea: {
        flex: 1,
    },
    headerContent: {
        flex: 1,
        paddingHorizontal: widthScale(24),
        paddingBottom: verticalScale(12),
        justifyContent: 'flex-end',
    },
    title: {
        color: '#ffffff',
        fontSize: responsiveFont(36),
        fontFamily: Fonts.rounded,
        fontWeight: '900',
    },
    scrollView: {
        flex: 1,
    },
    content: {
        padding: widthScale(8),
        gap: verticalScale(14),
    },
});
