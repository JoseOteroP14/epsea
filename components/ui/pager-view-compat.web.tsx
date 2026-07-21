import { Children, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type PagerViewCompatProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  initialPage?: number;
};

export function PagerViewCompat({
  children,
  style,
}: PagerViewCompatProps) {
  const { width } = useWindowDimensions();

  return (
    <ScrollView
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={styles.container}
    >
      {Children.map(children, (child, index) => (
        <View key={index} style={[styles.page, { width }]}>
          {child}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "stretch",
  },
  page: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
});
