import SwiftUI

struct SurveyEditorView: View {
    @StateObject var viewModel: SurveyEditorViewModel
    @Environment(\.presentationMode) var presentationMode
    
    // State for presenting QuestionEditorView
    @State private var showingQuestionEditor = false
    @State private var questionToEdit: Binding<QuestionItem>? = nil
    @State private var isAddingNewQuestion: Bool = false

    // Environment variable to access the managed object context for PersistenceService
    @Environment(\.managedObjectContext) private var viewContext

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Survey Details")) {
                    TextField("Survey Title", text: $viewModel.surveyTitle)
                        .accessibilityIdentifier("SurveyTitleTextField")
                }

                Section(header: Text("Questions")) {
                    if viewModel.questions.isEmpty {
                        Text("No questions yet. Add some!")
                            .foregroundColor(.gray)
                    }
                    List {
                        ForEach($viewModel.questions) { $questionItem in
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(questionItem.text.isEmpty ? "New Question" : questionItem.text)
                                        .font(.headline)
                                    Text(questionItem.type.rawValue)
                                        .font(.subheadline)
                                        .foregroundColor(.gray)
                                }
                                Spacer() // Pushes content to the left and chevron to the right
                                Image(systemName: "chevron.right") // Indicate tappable
                                    .foregroundColor(.gray)
                            }
                            .contentShape(Rectangle()) // Make the whole row tappable
                            .onTapGesture {
                                self.questionToEdit = $questionItem
                                self.isAddingNewQuestion = false
                                self.showingQuestionEditor = true
                            }
                            .accessibilityElement(children: .combine) // Combine children for accessibility
                            .accessibilityLabel("Edit question: \(questionItem.text.isEmpty ? "New Question" : questionItem.text), type: \(questionItem.type.rawValue)")

                        }
                        .onDelete(perform: viewModel.deleteQuestion)
                        .onMove(perform: viewModel.moveQuestion)
                    }
                    
                    Button("Add Question") {
                        viewModel.addQuestion()
                        // Get binding to the newly added question (which is the last one)
                        if let lastQuestion = viewModel.questions.last {
                             // Find the binding for the last question
                             // This requires questions to be identifiable and the view model to support it.
                             // A common pattern is to use indices or UUIDs.
                             // If QuestionItem is Identifiable and used with ForEach($viewModel.questions),
                             // we can get a binding to the last element.
                            self.questionToEdit = $viewModel.questions[viewModel.questions.count - 1]
                            self.isAddingNewQuestion = true
                            self.showingQuestionEditor = true
                        }
                    }
                    .accessibilityIdentifier("AddQuestionButton")
                }
            }
            .navigationTitle(viewModel.isNewSurvey ? "New Survey" : "Edit Survey")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        presentationMode.wrappedValue.dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        viewModel.saveSurvey()
                        presentationMode.wrappedValue.dismiss()
                    }
                    .disabled(viewModel.surveyTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.questions.isEmpty)
                    .accessibilityIdentifier("SaveSurveyButton")
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                     EditButton() // To enable list editing (move/delete)
                }
            }
            .sheet(isPresented: $showingQuestionEditor, onDismiss: {
                // If a new question was added but then cancelled in QuestionEditorView,
                // and it's still empty, consider removing it.
                if isAddingNewQuestion, let questionBinding = questionToEdit, questionBinding.wrappedValue.text.isEmpty {
                    if let index = viewModel.questions.firstIndex(where: { $0.id == questionBinding.id }) {
                        viewModel.questions.remove(at: index)
                    }
                }
                self.questionToEdit = nil // Reset
                self.isAddingNewQuestion = false
            }) {
                if let questionBinding = questionToEdit {
                    QuestionEditorView(questionItem: questionBinding)
                }
            }
        }
    }
}

struct SurveyEditorView_Previews: PreviewProvider {
    static var previews: some View {
        // For a new survey
        let newSurveyVM = SurveyEditorViewModel(
            persistenceService: PersistenceService(context: PersistenceController.preview.container.viewContext)
        )
        
        // For an existing survey
        let existingSurvey = Survey(context: PersistenceController.preview.container.viewContext)
        existingSurvey.id = UUID()
        existingSurvey.title = "Sample Existing Survey"
        existingSurvey.createdAt = Date()
        
        let question1 = Question(context: PersistenceController.preview.container.viewContext)
        question1.id = UUID()
        question1.text = "How are you?"
        question1.type = QuestionType.openEnded.rawValue
        question1.order = 0
        
        let question2 = Question(context: PersistenceController.preview.container.viewContext)
        question2.id = UUID()
        question2.text = "Favorite Food?"
        question2.type = QuestionType.singleChoice.rawValue
        question2.options = "[\"Pizza\", \"Burger\", \"Pasta\"]" // JSON string for options
        question2.order = 1
        
        existingSurvey.addToQuestions(question1)
        existingSurvey.addToQuestions(question2)
        
        let existingSurveyVM = SurveyEditorViewModel(
            survey: existingSurvey,
            persistenceService: PersistenceService(context: PersistenceController.preview.container.viewContext)
        )

        return Group {
            SurveyEditorView(viewModel: newSurveyVM)
                .previewDisplayName("New Survey")
            
            SurveyEditorView(viewModel: existingSurveyVM)
                .previewDisplayName("Edit Survey")
        }
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
    }
}
