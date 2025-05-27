import SwiftUI
import UIKit

struct ActivityViewControllerWrapper: UIViewControllerRepresentable {
    var activityItems: [Any]
    var applicationActivities: [UIActivity]? = nil

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(
            activityItems: activityItems,
            applicationActivities: applicationActivities
        )
        return controller
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {
        // No specific update logic is typically needed for UIActivityViewController
        // if the items don't change after presentation.
        // If items could change while the sheet is visible (unlikely for this use case),
        // one might reconfigure the controller here, but it's generally not recommended.
    }
}

// MARK: - Preview (Optional, as this is a utility)
// Previews for UIViewControllerRepresentable can be basic or demonstrate usage if complex.
// For ActivityViewControllerWrapper, a direct preview isn't very useful without a trigger.
// struct ActivityViewControllerWrapper_Previews: PreviewProvider {
//    static var previews: some View {
//        // Example of how you might try to preview it, though it won't show the actual share sheet.
//        // You'd typically test this in a running app.
//        Button("Show Share Sheet (Simulated)") {
//            // In a real app, this would be handled by the .sheet modifier
//        }
//        .sheet(isPresented: .constant(true)) { // Dummy presentation for preview structure
//            ActivityViewControllerWrapper(activityItems: ["Sample text to share", URL(string: "https://www.example.com")!])
//        }
//    }
// }
