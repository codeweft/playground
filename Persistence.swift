// Persistence.swift
import CoreData

struct PersistenceController {
    // MARK: - 1. Shared Singleton Instance
    static let shared = PersistenceController()

    // MARK: - 2. Persistent Container
    let container: NSPersistentContainer

    // MARK: - 3. Initialization
    init(inMemory: Bool = false) {
        // *** This is the crucial line for loading your data model ***
        // *** The name "VoiceSurveyor" MUST match your .xcdatamodeld file name ***
        container = NSPersistentContainer(name: "VoiceSurveyor")

        if inMemory {
            container.persistentStoreDescriptions.first!.url = URL(fileURLWithPath: "/dev/null")
        }

        // Enhanced error handling during store loading
        container.loadPersistentStores(completionHandler: { (storeDescription, error) in
            if let error = error as NSError? {
                // Replace this implementation with code to handle the error appropriately.
                // fatalError() causes the application to generate a crash log and terminate.
                // You should not use this function in a shipping application, although it may be useful during development.

                /*
                 Typical reasons for an error here include:
                 * The parent directory does not exist, cannot be created, or disallows writing.
                 * The persistent store is not accessible, due to permissions or data protection when the device is locked.
                 * The device is out of space.
                 * The store could not be migrated to the current model version.
                 Check the error message to determine what the actual problem was.
                 */
                print("Unresolved error during loading persistent stores: \(error), \(error.userInfo)")
                print("Common issues to check:")
                print("- Ensure the NSPersistentContainer name in Persistence.swift matches your .xcdatamodeld file name ('VoiceSurveyor').")
                print("- Verify the .xcdatamodeld file is correctly added to the target and is not corrupted.")
                print("- If you made changes to the model, ensure migrations are handled if needed.")
                // For development, you might still want to crash to notice the error immediately.
                // For production, you'd implement more graceful error handling (e.g., show an alert to the user).
                fatalError("Unresolved error \(error), \(error.userInfo)")
            }
        })
        container.viewContext.automaticallyMergesChangesFromParent = true
    }

    // MARK: - 4. Preview Configuration (Optional, but good for SwiftUI Previews)
    static var preview: PersistenceController = {
        let result = PersistenceController(inMemory: true)
        let viewContext = result.container.viewContext
        // Add any sample data for previews here, for example:
        // for _ in 0..<10 {
        //     let newItem = Item(context: viewContext) // Replace Item with your entity
        //     newItem.timestamp = Date() // Replace timestamp with your attribute
        // }
        do {
            try viewContext.save()
        } catch {
            let nsError = error as NSError
            fatalError("Unresolved error \(nsError), \(nsError.userInfo)")
        }
        return result
    }()

    // MARK: - 5. Convenience Function for Saving Context
    func saveContext() {
        let context = container.viewContext
        if context.hasChanges {
            do {
                try context.save()
            } catch {
                // Replace this implementation with code to handle the error appropriately.
                // fatalError() causes the application to generate a crash log and terminate.
                // You should not use this function in a shipping application.
                let nsError = error as NSError
                print("Error saving context: \(nsError), \(nsError.userInfo)")
                // Consider more user-friendly error handling in a production app,
                // such as showing an alert to the user.
                // fatalError("Unresolved error \(nsError), \(nsError.userInfo)")
            }
        }
    }
}
