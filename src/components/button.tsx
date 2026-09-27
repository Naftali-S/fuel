import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { Accent, Spacing } from '@/constants/theme';

type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
};

export function Button({ label, style, disabled, ...rest }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={(state) => [
        styles.button,
        (state.pressed || disabled) && styles.dimmed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: Accent.primary,
    paddingVertical: Spacing.three - 4,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  dimmed: {
    opacity: 0.6,
  },
  label: {
    color: Accent.onPrimary,
    fontSize: 16,
    fontWeight: 600,
  },
});
