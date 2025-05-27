import SwiftUI

struct QuestionEditorView: View {
    @Binding var questionItem: QuestionItem
    @Environment(\.presentationMode) var presentationMode

    // Temporary state for options editing
    @State private var optionText: String = ""
    @State private var editingOptions: [String] // Initialize with questionItem.options

    // To ensure options are correctly bound and updated
    init(questionItem: Binding<QuestionItem>) {
        self._questionItem = questionItem
        self._editingOptions = State(initialValue: questionItem.wrappedValue.options)
    }
    
    private var isChoiceQuestion: Bool {
        questionItem.type == .multipleChoice || questionItem.type == .singleChoice
    }

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Question Details")) {
                    TextField("Question Text", text: $questionItem.text)
                    
                    Picker("Question Type", selection: $questionItem.type) {
                        ForEach(QuestionType.allCases, id: \.self) { type in
                            Text(type.rawValue).tag(type)
                        }
                    }
                }

                if isChoiceQuestion {
                    Section(header: Text("Options (\(questionItem.type.rawValue))")) {
                        ForEach(editingOptions.indices, id: \.self) { index in
                            HStack {
                                TextField("Option \(index + 1)", text: $editingOptions[index])
                                Button(action: {
                                    editingOptions.remove(at: index)
                                }) {
                                    Image(systemName: "trash")
                                        .foregroundColor(.red)
                                }
                            }
                        }
                        .onDelete { indices in
                            editingOptions.remove(atOffsets: indices)
                        }

                        HStack {
                            TextField("New Option", text: $optionText)
                            Button("Add") {
                                if !optionText.isEmpty {
                                    editingOptions.append(optionText)
                                    optionText = "" // Clear for next entry
                                }
                            }
                            .disabled(optionText.isEmpty)
                        }
                    }
                }
            }
            .navigationTitle("Edit Question")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        // Revert options if cancelled, as editingOptions is local state
                        // The main questionItem.text and questionItem.type are bound directly so they'd already be "changed"
                        // but won't be saved if cancelled at SurveyEditorView level.
                        // For options, we need to ensure the original binding isn't updated yet.
                        presentationMode.wrappedValue.dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        // Commit the locally edited options back to the binding
                        questionItem.options = editingOptions
                        if !isChoiceQuestion {
                            questionItem.options = [] // Clear options if not a choice type
                        }
                        presentationMode.wrappedValue.dismiss()
                    }
                }
            }
            // Update local editingOptions if the questionItem changes externally (e.g., type changes)
            .onChange(of: questionItem.type) { _ in
                if !isChoiceQuestion {
                    editingOptions = []
                } else if editingOptions.isEmpty && !questionItem.options.isEmpty {
                    // If type changed to choice and options were previously set for this item
                    editingOptions = questionItem.options
                }
            }
            .onChange(of: questionItem.options) { newOptions in
                 // This ensures that if the parent changes options (e.g. loading from core data),
                 // the local state `editingOptions` is also updated.
                 if editingOptions != newOptions {
                     editingOptions = newOptions
                 }
             }
        }
    }
}

struct QuestionEditorView_Previews: PreviewProvider {
    static var previews: some View {
        // Sample binding for preview
        @State var sampleQuestionItem = QuestionItem(
            text: "What is your favorite color?",
            type: .multipleChoice,
            options: ["Red", "Green", "Blue"],
            order: 0
        )
        
        // Another sample for open-ended
        @State var sampleOpenEndedQuestionItem = QuestionItem(
            text: "Any comments?",
            type: .openEnded,
            options: [],
            order: 1
        )

        Group {
            QuestionEditorView(questionItem: $sampleQuestionItem)
            QuestionEditorView(questionItem: $sampleOpenEndedQuestionItem)
        }
    }
}
