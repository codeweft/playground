import Foundation
import CoreData
import Combine

class SurveyViewModel: ObservableObject {
    @Published var title: String = ""
    @Published var surveyDescription: String = ""

    private var surveyToEdit: Survey?
    private let moc: NSManagedObjectContext

    init(moc: NSManagedObjectContext, survey: Survey? = nil) {
        self.moc = moc
        self.surveyToEdit = survey

        if let survey = survey {
            self.title = survey.title ?? ""
            self.surveyDescription = survey.surveyDescription ?? ""
        }
    }

    func saveSurvey() {
        if let surveyToEdit = surveyToEdit {
            // Update existing survey
            surveyToEdit.title = title
            surveyToEdit.surveyDescription = surveyDescription
            surveyToEdit.objectWillChange.send() // Manually notify observers if needed
        } else {
            // Create new survey
            let newSurvey = Survey(context: moc)
            newSurvey.id = UUID()
            newSurvey.createdAt = Date()
            newSurvey.title = title
            newSurvey.surveyDescription = surveyDescription
        }

        do {
            try moc.save()
        } catch {
            print("Error saving survey: \(error.localizedDescription)")
            // Handle save error appropriately in a real app
        }
    }

    func deleteSurvey() {
        guard let surveyToDelete = surveyToEdit else { return }

        moc.delete(surveyToDelete)

        do {
            try moc.save()
        } catch {
            print("Error deleting survey: \(error.localizedDescription)")
            // Handle delete error appropriately
        }
    }
}
