import React from 'react';
import { StyleSheet, View, SafeAreaView, Platform, StatusBar } from 'react-native';
import MediaControls from './src/components/MediaControls';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <MediaControls />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, // Handle Android status bar
  },
});
