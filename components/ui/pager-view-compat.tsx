import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import PagerView from "react-native-pager-view";

type PagerViewCompatProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  initialPage?: number;
  onPageSelected?: (page: number) => void;
};

export function PagerViewCompat({
  children,
  style,
  initialPage = 0,
  onPageSelected,
}: PagerViewCompatProps) {
  return (
    <PagerView
      style={style}
      initialPage={initialPage}
      overdrag
      onPageSelected={
        onPageSelected
          ? (e) => onPageSelected(e.nativeEvent.position)
          : undefined
      }
    >
      {children}
    </PagerView>
  );
}
