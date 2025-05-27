import SwiftUI
import CoreData

struct QuestionEditView: View {
    @StateObject private var questionViewModel: QuestionViewModel
    @Environment(\.dismiss) private var dismiss
    // moc is passed to the ViewModel, so direct environment access here is optional
    // but can be useful for other direct Core Data operations if needed.
    // @Environment(\.managedObjectContext) private var moc

    // These are passed in to initialize the ViewModel
    // private var survey: Survey // survey is in questionViewModel
    // private var questionToEdit: Question? // questionToEdit is in questionViewModel
    // private var order: Int16 // order is in questionViewModel

    init(moc: NSManagedObjectContext, survey: Survey, question: Question? = nil, order: Int16) {
        // Initialize the StateObject using the parameters
        _questionViewModel = StateObject(wrappedValue: QuestionViewModel(
            moc: moc,
            survey: survey,
            question: question,
            order: order
        ))
    }

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Question Details")) {
                    TextField("Question Text", text: $questionViewModel.questionText)
                    
                    Picker("Question Type", selection: $questionViewModel.questionType) {
                        ForEach(QuestionType.allCases) { type in
                            Text(type.rawValue).tag(type)
                        }
                    }
                    
                    if questionViewModel.questionType == .multipleChoice {
                        TextField("Options (comma-separated)", text: $questionViewModel.optionsString)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                            .keyboardType(.asciiCapable) // Simple keyboard for comma separation
                        Text("Provide options like: Option A,Option B,Option C")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                }
                 Section(header: Text("Order")) {
                     // Display order, typically not directly editable in this manner
                     // as it's managed by the list view or automatically.
                     // If you want to allow manual setting of order, a Stepper or TextField could be used.
                     Text("Question Order: \(questionViewModel.order)")
                 }
            }
            .navigationTitle(questionViewModel.questionText.isEmpty && questionViewModel.optionsString.isEmpty ? "Add Question" : "Edit Question") // Heuristic title
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        questionViewModel.saveQuestion()
                        dismiss()
                    }
                    // Disable save if question text is empty
                    .disabled(questionViewModel.questionText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

// MARK: - Preview
struct QuestionEditView_Previews: PreviewProvider {
    static var previews: some View {
        let moc = PersistenceController.preview.container.viewContext

        // Create a sample survey for the preview.
        let sampleSurvey = Survey(context: moc)
        sampleSurvey.id = UUID()
        sampleSurvey.title = "Preview Survey for Question Edit"
        sampleSurvey.createdAt = Date()

        // Preview for adding a new question
        NavigationView {
            QuestionEditView(moc: moc, survey: sampleSurvey, order: 0)
        }
        .previewDisplayName("Add Question")

        // Preview for editing an existing question
        let sampleQuestion = Question(context: moc)
        sampleQuestion.id = UUID()
        sampleQuestion.text = "Existing question text"
        sampleQuestion.questionType = QuestionType.multipleChoice.rawValue
        sampleQuestion.options = "Option1,Option2"
        sampleQuestion.order = 1
        sampleQuestion.survey = sampleSurvey // Link to survey

        return NavigationView {
            QuestionEditView(moc: moc, survey: sampleSurvey, question: sampleQuestion, order: sampleQuestion.order)
        }
        .previewDisplayName("Edit Question")
    }
}
