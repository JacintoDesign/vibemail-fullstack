import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  variant?: "line";
  width?: number;
  height?: number;
}

export function Skeleton({ width, height = 12 }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={styles.line}
      style={{
        display: "block",
        width: width != null ? width : "100%",
        height,
      }}
    />
  );
}
