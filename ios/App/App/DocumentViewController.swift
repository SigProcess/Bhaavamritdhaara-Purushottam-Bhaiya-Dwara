import PDFKit
import UIKit

final class DocumentViewController: UIViewController {
    let sessionId: String
    let resolvedDocument: ResolvedDocument
    var onDismiss: ((String) -> Void)?

    private let pdfView = PDFView()
    private lazy var zoomOutButton = makeToolbarButton(
        title: "Zoom Out",
        imageName: "minus.magnifyingglass",
        action: #selector(zoomOut)
    )
    private lazy var zoomInButton = makeToolbarButton(
        title: "Zoom In",
        imageName: "plus.magnifyingglass",
        action: #selector(zoomIn)
    )
    private lazy var zoomLabel: UILabel = {
        let label = UILabel()
        label.font = .preferredFont(forTextStyle: .body)
        label.adjustsFontForContentSizeCategory = true
        label.textAlignment = .center
        label.accessibilityTraits = .updatesFrequently
        label.setContentCompressionResistancePriority(.required, for: .horizontal)
        return label
    }()

    private var minimumDocumentScale: CGFloat = 1
    private var maximumDocumentScale: CGFloat = 1
    private var didConfigureScale = false
    private var didMoveAccessibilityFocus = false
    private var didNotifyDismissal = false

    init(sessionId: String, resolvedDocument: ResolvedDocument) {
        self.sessionId = sessionId
        self.resolvedDocument = resolvedDocument
        super.init(nibName: nil, bundle: nil)
        title = resolvedDocument.title
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        configurePDFView()
        configureNavigationControls()
        configureZoomControls()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !didMoveAccessibilityFocus else { return }
        didMoveAccessibilityFocus = true
        UIAccessibility.post(notification: .screenChanged, argument: pdfView)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        configureInitialScaleIfNeeded()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if presentingViewController == nil && navigationController?.presentingViewController == nil {
            notifyDismissalOnce()
        }
    }

    func close(animated: Bool, completion: (() -> Void)? = nil) {
        let shouldAnimate = animated && !UIAccessibility.isReduceMotionEnabled
        dismiss(animated: shouldAnimate) { [weak self] in
            self?.notifyDismissalOnce()
            completion?()
        }
    }

    private func configurePDFView() {
        pdfView.translatesAutoresizingMaskIntoConstraints = false
        pdfView.document = resolvedDocument.pdfDocument
        pdfView.displayMode = .singlePageContinuous
        pdfView.displayDirection = .vertical
        pdfView.displaysPageBreaks = true
        pdfView.pageShadowsEnabled = true
        pdfView.autoScales = false
        pdfView.backgroundColor = .secondarySystemBackground
        pdfView.accessibilityLabel = "\(resolvedDocument.title), PDF document"

        view.addSubview(pdfView)
        NSLayoutConstraint.activate([
            pdfView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            pdfView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            pdfView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            pdfView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])

        if let firstPage = resolvedDocument.pdfDocument.page(at: 0) {
            pdfView.go(to: firstPage)
        }
    }

    private func configureNavigationControls() {
        let done = UIBarButtonItem(
            title: "Done",
            style: .done,
            target: self,
            action: #selector(doneTapped)
        )
        done.accessibilityLabel = "Close \(resolvedDocument.title)"
        let export = UIBarButtonItem(
            title: "Export",
            style: .plain,
            target: self,
            action: #selector(exportTapped)
        )
        export.accessibilityLabel = "Share or save \(resolvedDocument.title)"
        navigationItem.leftBarButtonItem = done
        navigationItem.rightBarButtonItem = export
        navigationItem.largeTitleDisplayMode = .never
    }

    private func configureZoomControls() {
        let zoomOutItem = UIBarButtonItem(customView: zoomOutButton)
        let zoomLabelItem = UIBarButtonItem(customView: zoomLabel)
        let zoomInItem = UIBarButtonItem(customView: zoomInButton)
        toolbarItems = [
            UIBarButtonItem(systemItem: .flexibleSpace),
            zoomOutItem,
            UIBarButtonItem(systemItem: .fixedSpace),
            zoomLabelItem,
            UIBarButtonItem(systemItem: .fixedSpace),
            zoomInItem,
            UIBarButtonItem(systemItem: .flexibleSpace)
        ]
        navigationController?.setToolbarHidden(false, animated: false)
    }

    private func configureInitialScaleIfNeeded() {
        guard !didConfigureScale, pdfView.bounds.width > 0 else { return }
        let fittedScale = pdfView.scaleFactorForSizeToFit
        minimumDocumentScale = fittedScale > 0 ? fittedScale : 1
        let maximumMultiplier: CGFloat = resolvedDocument.kind == .bhajan ? 5 : 3
        maximumDocumentScale = minimumDocumentScale * maximumMultiplier
        pdfView.minScaleFactor = minimumDocumentScale
        pdfView.maxScaleFactor = maximumDocumentScale
        pdfView.scaleFactor = minimumDocumentScale
        didConfigureScale = true
        updateZoomState()

        if let firstPage = resolvedDocument.pdfDocument.page(at: 0) {
            pdfView.go(to: firstPage)
        }
    }

    private func makeToolbarButton(title: String, imageName: String, action: Selector) -> UIButton {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setImage(UIImage(systemName: imageName), for: .normal)
        button.accessibilityLabel = title
        button.tintColor = .label
        button.backgroundColor = .secondarySystemBackground
        button.layer.cornerRadius = 8
        button.layer.borderWidth = 1
        button.layer.borderColor = UIColor.label.cgColor
        button.addTarget(self, action: action, for: .touchUpInside)
        NSLayoutConstraint.activate([
            button.widthAnchor.constraint(greaterThanOrEqualToConstant: 44),
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
        return button
    }

    @objc private func doneTapped() {
        close(animated: true)
    }

    @objc private func exportTapped() {
        exportActiveDocument()
    }

    private func exportActiveDocument() {
        DocumentShareService.shared.export(sessionId: sessionId) { [weak self] result in
            guard let self else { return }
            guard case .failure(let error) = result else { return }
            self.presentExportFailure(error)
        }
    }

    private func presentExportFailure(_ error: DocumentShareError) {
        guard presentedViewController == nil else { return }

        let alert = UIAlertController(
            title: "Export Failed",
            message: error.userMessage,
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        if error != .sessionNotActive && error != .presentationInProgress {
            alert.addAction(UIAlertAction(title: "Retry", style: .default) { [weak self] _ in
                self?.exportActiveDocument()
            })
        }
        present(alert, animated: !UIAccessibility.isReduceMotionEnabled)
    }

    @objc private func zoomOut() {
        setRelativeZoom(currentRelativeZoom - 0.5)
    }

    @objc private func zoomIn() {
        setRelativeZoom(currentRelativeZoom + 0.5)
    }

    private var currentRelativeZoom: CGFloat {
        guard minimumDocumentScale > 0 else { return 1 }
        return pdfView.scaleFactor / minimumDocumentScale
    }

    private func setRelativeZoom(_ proposedValue: CGFloat) {
        let maximumMultiplier: CGFloat = resolvedDocument.kind == .bhajan ? 5 : 3
        let clamped = min(max(proposedValue, 1), maximumMultiplier)
        pdfView.scaleFactor = minimumDocumentScale * clamped
        updateZoomState()
        UIAccessibility.post(notification: .announcement, argument: zoomLabel.accessibilityLabel)
    }

    private func updateZoomState() {
        let maximumMultiplier: CGFloat = resolvedDocument.kind == .bhajan ? 5 : 3
        let relative = min(max(currentRelativeZoom, 1), maximumMultiplier)
        let percentage = Int((relative * 100).rounded())
        zoomLabel.text = "\(percentage)%"
        zoomLabel.accessibilityLabel = "Zoom \(percentage) percent"
        zoomOutButton.isEnabled = relative > 1
        zoomInButton.isEnabled = relative < maximumMultiplier
    }

    private func notifyDismissalOnce() {
        guard !didNotifyDismissal else { return }
        didNotifyDismissal = true
        onDismiss?(sessionId)
    }
}
