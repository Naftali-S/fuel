import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function AppTabs() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gauge.with.needle', selected: 'gauge.with.needle.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="nutrients">
        <NativeTabs.Trigger.Label>Nutrients</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'leaf', selected: 'leaf.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="diagnostics">
        <NativeTabs.Trigger.Label>Diagnostics</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="stethoscope" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
