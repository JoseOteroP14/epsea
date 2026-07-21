import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import PagerView from "react-native-pager-view";

type PagerViewCompatProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  initialPage?: number;
};

export function PagerViewCompat({
  children,
  style,
  initialPage = 0,
}: PagerViewCompatProps) {
  return (
    <PagerView style={style} initialPage={initialPage} overdrag>
      {children}
    </PagerView>
  );
}
