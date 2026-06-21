import { Alert, Platform } from 'react-native';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

class WebAlert {
  static alert(
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: any
  ): void {
    if (Platform.OS === 'web') {
      // Web implementation using native browser confirm/alert
      if (!buttons || buttons.length === 0) {
        // Simple alert
        window.alert(`${title}${message ? '\n\n' + message : ''}`);
        return;
      }

      if (buttons.length === 1) {
        // Single button alert
        window.alert(`${title}${message ? '\n\n' + message : ''}`);
        if (buttons[0].onPress) {
          buttons[0].onPress();
        }
        return;
      }

      if (buttons.length === 2) {
        // Two button confirm
        const result = window.confirm(`${title}${message ? '\n\n' + message : ''}`);
        if (result) {
          // User clicked OK (second button, usually the action button)
          const actionButton = buttons.find(b => b.style !== 'cancel') || buttons[1];
          if (actionButton?.onPress) {
            actionButton.onPress();
          }
        } else {
          // User clicked Cancel (first button or cancel button)
          const cancelButton = buttons.find(b => b.style === 'cancel') || buttons[0];
          if (cancelButton?.onPress) {
            cancelButton.onPress();
          }
        }
        return;
      }

      // More than 2 buttons - use a custom implementation
      this.showMultiButtonAlert(title, message, buttons);
    } else {
      // Native implementation
      Alert.alert(title, message, buttons, options);
    }
  }

  private static showMultiButtonAlert(title: string, message?: string, buttons?: AlertButton[]): void {
    // Create a simple text-based selection for web
    let promptText = `${title}${message ? '\n\n' + message : ''}\n\nChoose an option:\n`;
    
    buttons?.forEach((button, index) => {
      promptText += `${index + 1}. ${button.text}\n`;
    });
    
    promptText += '\nEnter the number of your choice:';
    
    const choice = window.prompt(promptText);
    const choiceIndex = parseInt(choice || '0') - 1;
    
    if (choiceIndex >= 0 && choiceIndex < (buttons?.length || 0)) {
      const selectedButton = buttons![choiceIndex];
      if (selectedButton.onPress) {
        selectedButton.onPress();
      }
    }
  }
}

export default WebAlert; 