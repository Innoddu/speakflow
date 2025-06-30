import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';

interface Voice {
  id: string;
  name: string;
  gender: string;
  recommended?: boolean;
}

interface VoiceSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (voiceId: string) => void;
  selectedVoice: string;
}

const VOICES: Voice[] = [
  { id: 'nova', name: 'Nova', gender: 'female', recommended: true },
  { id: 'shimmer', name: 'Shimmer', gender: 'female' },
  { id: 'alloy', name: 'Alloy', gender: 'neutral' },
  { id: 'fable', name: 'Fable', gender: 'neutral' },
  { id: 'echo', name: 'Echo', gender: 'male' },
  { id: 'onyx', name: 'Onyx', gender: 'male' },
];

export default function VoiceSelector({ visible, onClose, onSelect, selectedVoice }: VoiceSelectorProps) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>🎤 Select Voice</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.voiceList}>
            {VOICES.map((voice) => (
              <TouchableOpacity
                key={voice.id}
                style={[
                  styles.voiceItem,
                  selectedVoice === voice.id && styles.selectedVoiceItem
                ]}
                onPress={() => {
                  onSelect(voice.id);
                  onClose();
                }}
              >
                <View style={styles.voiceInfo}>
                  <Text style={[
                    styles.voiceName,
                    selectedVoice === voice.id && styles.selectedVoiceText
                  ]}>
                    {voice.name}
                    {voice.recommended && <Text style={styles.recommendedBadge}> ⭐</Text>}
                  </Text>
                  <Text style={[
                    styles.voiceGender,
                    selectedVoice === voice.id && styles.selectedVoiceText
                  ]}>
                    {voice.gender}
                  </Text>
                </View>
                {selectedVoice === voice.id && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
          
          <Text style={styles.note}>
            💡 Nova is recommended for English learning
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    width: '100%',
    maxWidth: 350,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#666',
  },
  voiceList: {
    marginBottom: 15,
  },
  voiceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
  },
  selectedVoiceItem: {
    backgroundColor: '#667eea',
  },
  voiceInfo: {
    flex: 1,
  },
  voiceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  voiceGender: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  selectedVoiceText: {
    color: 'white',
  },
  recommendedBadge: {
    color: '#ffd700',
  },
  checkmark: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
  },
  note: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
}); 