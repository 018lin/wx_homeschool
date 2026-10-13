var createTaskPage = require("../../../utils/task-page.js");
var definition = createTaskPage("parent");
Page(Object.assign(definition, {
  onRetry: definition.onRetry,
  chooseFit: definition.chooseFit,
  setSubType: definition.setSubType,
  toggleCheck: definition.toggleCheck,
  onContentInput: definition.onContentInput,
  chooseImage: definition.chooseImage,
  stopRecording: definition.stopRecording,
  startRecording: definition.startRecording,
  chooseVideo: definition.chooseVideo,
  previewImage: definition.previewImage,
  playAudio: definition.playAudio,
  removeAttachment: definition.removeAttachment,
  onSaveDraft: definition.onSaveDraft,
  onConfirmSubmit: definition.onConfirmSubmit
}));
