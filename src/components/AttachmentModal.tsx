import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { t } from '../utils/translator';

interface AttachmentModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectImage: () => void;
  onTakePhoto: () => void;
  onSelectFile: () => void;
}

export const AttachmentModal: React.FC<AttachmentModalProps> = ({ 
  visible, 
  onClose, 
  onSelectImage, 
  onTakePhoto,
  onSelectFile 
}) => {
  const { theme } = useTheme();

  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.bottomSheet, { backgroundColor: theme.colors.card }]}>
              
              <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
              
              <Text style={[styles.title, { color: theme.colors.text }]}>
                {t('attachmentMenuTitle')}
              </Text>

              <TouchableOpacity style={styles.optionRow} onPress={onSelectImage}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '20' }]}>
                  <Ionicons name="images-outline" size={24} color={theme.colors.primary} />
                </View>
                <Text style={[styles.optionText, { color: theme.colors.text }]}>
                  {t('chooseFromAlbum')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.optionRow} onPress={onTakePhoto}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '20' }]}>
                  <Ionicons name="camera-outline" size={24} color={theme.colors.primary} />
                </View>
                <Text style={[styles.optionText, { color: theme.colors.text }]}>
                  {t('takePhoto')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.optionRow} onPress={onSelectFile}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '20' }]}>
                  <Ionicons name="document-text-outline" size={24} color={theme.colors.primary} />
                </View>
                <Text style={[styles.optionText, { color: theme.colors.text }]}>
                  {t('chooseFile')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.cancelButton, { backgroundColor: theme.colors.background }]} 
                onPress={onClose}
              >
                <Text style={[styles.cancelText, { color: theme.colors.text }]}>
                  {t('cancel')}
                </Text>
              </TouchableOpacity>

            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)', 
    justifyContent: 'flex-end', 
  },
  bottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40, // 下部の余白をしっかり取る
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  cancelButton: {
    marginTop: 20,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});