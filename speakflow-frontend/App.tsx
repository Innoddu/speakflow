import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import VideoDetailScreen from './src/screens/VideoDetailScreen';
import ScriptPracticeScreen from './src/screens/ScriptPracticeScreen';
import HistoryScreen from './src/screens/HistoryScreen';

export type RootStackParamList = {
  Home: undefined;
  Search: undefined;
  History: undefined;
  VideoDetail: { videoId: string; videoTitle: string; fromHistory?: boolean };
  ScriptPractice: { videoId: string; videoTitle: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#1a1a1a',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        >
          <Stack.Screen 
            name="Home" 
            component={HomeScreen}
            options={{ title: 'SpeakFlow' }}
          />
          <Stack.Screen 
            name="Search" 
            component={SearchScreen}
            options={{ title: 'Search Videos' }}
          />
          <Stack.Screen 
            name="History" 
            component={HistoryScreen}
            options={{ title: 'Learning History' }}
          />
          <Stack.Screen 
            name="VideoDetail" 
            component={VideoDetailScreen}
            options={{ title: 'Video Details' }}
          />
          <Stack.Screen 
            name="ScriptPractice" 
            component={ScriptPracticeScreen}
            options={{ title: 'Practice Script' }}
          />
        </Stack.Navigator>
        <StatusBar style="light" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
