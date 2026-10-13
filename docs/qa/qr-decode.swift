// Reads every QR code in the given images with Apple Vision and prints one line per code:
//   <image>\t<payload>
// Usage: swift docs/qa/qr-decode.swift page-1.png [page-2.png ...]
import Foundation
import Vision
import AppKit

for path in CommandLine.arguments.dropFirst() {
  guard let img = NSImage(contentsOfFile: path),
        let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("\(path)\tUNREADABLE"); continue }
  let req = VNDetectBarcodesRequest()
  req.symbologies = [.qr]
  try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
  let found = (req.results ?? []).compactMap { $0.payloadStringValue }
  if found.isEmpty { print("\(path)\tNONE") }
  for p in found { print("\(path)\t\(p)") }
}
