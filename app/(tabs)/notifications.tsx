import StandardView from '@/components/standard-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useNotificationStore } from '@/store/useNotificationStore';
import { responsiveFont, verticalScale, widthScale } from '@/utils/responsive';
import { Info } from "lucide-react-native";
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export default function TabTwoScreen() {
  const { notifications, markAsRead, clearAll } = useNotificationStore();

  return (
    <StandardView
      headerBackgroundColor={{ light: '#2ecc71', dark: '#0a1a10' }}
      headerTitle="Notificaciones"
    >
      <ThemedView style={styles.contentContainer}>
        {notifications.map((n) => (
          <TouchableOpacity
            key={n.id}
            style={[styles.notificationCard, !n.isRead && styles.unreadCard]}
            onPress={() => markAsRead(n.id)}
          >
            <View style={styles.notificationHeader}>
              <View style={styles.titleRow}>
                <Info size={responsiveFont(16)} color={n.isRead ? "#687076" : "#2ecc71"} style={{ marginRight: widthScale(8) }} />
                <ThemedText type="defaultSemiBold">{n.title}</ThemedText>
              </View>
              {!n.isRead && <View style={styles.unreadDot} />}
            </View>
            <ThemedText style={styles.message}>{n.message}</ThemedText>
          </TouchableOpacity>
        ))}
        {notifications.length > 0 && (
          <TouchableOpacity onPress={clearAll} style={styles.clearBtn}>
            <ThemedText style={styles.clearText}>Limpiar todas</ThemedText>
          </TouchableOpacity>
        )}
        {notifications.length === 0 && (
          <ThemedText style={{ textAlign: 'center', marginTop: verticalScale(40), opacity: 0.6 }}>
            No tienes notificaciones pendientes.
          </ThemedText>
        )}
      </ThemedView>
    </StandardView>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    gap: verticalScale(12),
  },
  notificationCard: {
    padding: widthScale(16),
    borderRadius: widthScale(16),
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  unreadCard: {
    backgroundColor: 'rgba(46, 204, 113, 0.05)',
    borderColor: 'rgba(46, 204, 113, 0.1)',
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(4),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadDot: {
    width: widthScale(8),
    height: widthScale(8),
    borderRadius: widthScale(4),
    backgroundColor: '#2ecc71',
  },
  message: {
    fontSize: responsiveFont(15),
    opacity: 0.8,
  },
  clearBtn: {
    marginTop: verticalScale(20),
    alignItems: 'center',
  },
  clearText: {
    color: '#e74c3c',
    fontSize: responsiveFont(14),
    fontWeight: '600',
  }
});
