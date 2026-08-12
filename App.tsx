import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';

import { AppNavigator } from './src/AppNavigator';
import { AppStoreProvider } from './src/store/AppStore';
import { colors } from './src/ui/theme';

export default function App() {
  return (
    <AppStoreProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <AppNavigator />
      </SafeAreaView>
    </AppStoreProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
