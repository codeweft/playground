import Foundation
import CoreData
import Combine

class SurveyListViewModel: ObservableObject {
    @Published var surveys: [Survey] = []
    private let moc: NSManagedObjectContext

    init(moc: NSManagedObjectContext) {
        self.moc = moc
    }

    func fetchSurveys() {
        let request: NSFetchRequest<Survey> = Survey.fetchRequest()
        request.sortDescriptors = [NSSortDescriptor(keyPath: \Survey.createdAt, ascending: true)] // Ensure 'createdAt' is a valid key path

        do {
            surveys = try moc.fetch(request)
        } catch {
            print("Error fetching surveys: \(error.localizedDescription)")
            // Handle fetch error appropriately
        }
    }

    func deleteSurvey(at offsets: IndexSet) {
        offsets.map { surveys[$0] }.forEach(moc.delete)

        do {
            try moc.save()
            // surveys.remove(atOffsets: offsets) // Update the local array after successful save
            fetchSurveys() // Or re-fetch to ensure UI consistency with the store
        } catch {
            print("Error deleting survey: \(error.localizedDescription)")
            // Handle delete error appropriately
        }
    }
}
