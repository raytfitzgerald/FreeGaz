// Makes the two layers of a talking bobblehead from a photo (macOS 14+, Vision + Core Image):
//   <outPrefix>-head.png  the head, cut out with a white sticker outline, with a dark
//                         mouth painted where only an open jaw would show it
//   <outPrefix>-jaw.png   the jaw below the lip line; the app slides it down to talk
// Vision picks the face nearest the hint point and the person instance under it, so
// nobody standing behind survives. The cut follows the jawline landmarks, so no collar,
// tie or lapel pin does either; scraps of mask not joined to the face are dropped, and wispy
// edges take the head's colour, not the background's. Both layers share one square canvas,
// chin at the bottom.
//
// usage: swift scripts/toon-cutout.swift <photo> <outPrefix> <hintX> <hintY> [trim]
//   hint: 0..1, origin top-left. trim: how far to pull the edge in, as a fraction of the face
//   width (default 0.006); raise it when a busy background clings to the hairline.
// The app ships them as WebP (quality 90). Credits for every source photo: src/renderer/src/coach/toon/heads/ATTRIBUTION.md
import AppKit
import CoreImage
import CoreImage.CIFilterBuiltins
import Vision

let args = CommandLine.arguments
guard args.count >= 5, let hx = Double(args[3]), let hy = Double(args[4]) else {
  fatalError("usage: cutout <in> <outPrefix> <hintX> <hintY> [trim]")
}
let trim = args.count >= 6 ? Double(args[5]) ?? 0.006 : 0.006
let url = URL(fileURLWithPath: args[1])
let outPrefix = args[2]
let hint = CGPoint(x: hx, y: 1 - hy) // Vision space: origin bottom-left

guard let src = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else { fatalError("can't read \(url.path)") }
let ctx = CIContext()
guard let cg = ctx.createCGImage(src, from: src.extent) else { fatalError("no CGImage") }
let W = CGFloat(cg.width), H = CGFloat(cg.height)
let handler = VNImageRequestHandler(cgImage: cg, options: [:])

// 1. the face nearest the hint
let faceReq = VNDetectFaceRectanglesRequest()
try handler.perform([faceReq])
let faces = (faceReq.results ?? []).map { $0.boundingBox }
guard !faces.isEmpty else { fatalError("no face found") }
func dist(_ r: CGRect) -> CGFloat { hypot(r.midX - hint.x, r.midY - hint.y) }
let face = faces.min { dist($0) < dist($1) }!
let fx = face.minX * W, fy = face.minY * H, fw = face.width * W, fh = face.height * H

// 2. the person instance under the face, at full resolution
let instReq = VNGeneratePersonInstanceMaskRequest()
try handler.perform([instReq])
guard let inst = instReq.results?.first else { fatalError("no person instances") }
let labels = inst.instanceMask
CVPixelBufferLockBaseAddress(labels, .readOnly)
let lw = CVPixelBufferGetWidth(labels), lh = CVPixelBufferGetHeight(labels)
let rowBytes = CVPixelBufferGetBytesPerRow(labels)
let base = CVPixelBufferGetBaseAddress(labels)!.assumingMemoryBound(to: UInt8.self)
// sample a small grid over the face; the most common non-zero label wins
var votes: [UInt8: Int] = [:]
for gy in 0..<9 { for gx in 0..<9 {
  let nx = face.minX + face.width * (0.1 + 0.8 * CGFloat(gx) / 8)
  let ny = face.minY + face.height * (0.1 + 0.8 * CGFloat(gy) / 8)
  let px = min(lw - 1, max(0, Int(nx * CGFloat(lw))))
  let py = min(lh - 1, max(0, Int((1 - ny) * CGFloat(lh)))) // buffer rows run top-down
  let l = base[py * rowBytes + px]
  if l != 0 { votes[l, default: 0] += 1 }
}}
CVPixelBufferUnlockBaseAddress(labels, .readOnly)
guard let label = votes.max(by: { $0.value < $1.value })?.key else { fatalError("no person under the face") }
let instBuf = try inst.generateScaledMaskForImage(forInstances: IndexSet(integer: Int(label)), from: handler)
var personMask = CIImage(cvPixelBuffer: instBuf)
personMask = personMask.transformed(by: CGAffineTransform(scaleX: W / personMask.extent.width, y: H / personMask.extent.height))

// fine hair edges come from the accurate all-people mask, limited to this person
let segReq = VNGeneratePersonSegmentationRequest()
segReq.qualityLevel = .accurate
segReq.outputPixelFormat = kCVPixelFormatType_OneComponent8
try handler.perform([segReq])
guard let segBuf = segReq.results?.first?.pixelBuffer else { fatalError("no mask") }
var seg = CIImage(cvPixelBuffer: segBuf)
seg = seg.transformed(by: CGAffineTransform(scaleX: W / seg.extent.width, y: H / seg.extent.height))
let grownPerson = personMask.applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: max(2, fw * 0.012)])
  .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: max(1, fw * 0.005)]).cropped(to: src.extent)
let mask = seg.applyingFilter("CIMultiplyCompositing", parameters: [kCIInputBackgroundImageKey: grownPerson]).cropped(to: src.extent)

// 3. head region: this person above the jawline. The face-contour landmarks
// run ear to ear through the chin; the polygon keeps everything above them,
// flares out past the ear lobes, and drops a hair below the chin.
let lmReq = VNDetectFaceLandmarksRequest()
lmReq.inputFaceObservations = [VNFaceObservation(boundingBox: face)]
try handler.perform([lmReq])
guard let contour = lmReq.results?.first?.landmarks?.faceContour else { fatalError("no face contour") }
var jaw = contour.pointsInImage(imageSize: CGSize(width: W, height: H)) // origin bottom-left
if jaw.first!.x > jaw.last!.x { jaw.reverse() }
let chinDrop = fh * 0.035
let chinI = jaw.indices.min { jaw[$0].y < jaw[$1].y }!
jaw = jaw.enumerated().map { i, p in
  // push the lower jaw down a touch (most at the chin), for a soft edge that still ends under it
  let w = 1 - abs(CGFloat(i - chinI)) / CGFloat(max(chinI, jaw.count - 1 - chinI))
  return CGPoint(x: p.x, y: p.y - chinDrop * max(0, w))
}
let top = max(jaw.first!.y, jaw.last!.y) + fh * 1.6
let flare = fw * 0.42, lobe = fh * 0.28
var poly = [CGPoint(x: jaw.first!.x - flare, y: jaw.first!.y - lobe)] + jaw + [CGPoint(x: jaw.last!.x + flare, y: jaw.last!.y - lobe)]
poly += [CGPoint(x: jaw.last!.x + flare, y: top), CGPoint(x: jaw.first!.x - flare, y: top)]
let cs = CGColorSpaceCreateDeviceGray()
let g = CGContext(data: nil, width: Int(W), height: Int(H), bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.none.rawValue)!
g.setFillColor(gray: 0, alpha: 1); g.fill(CGRect(x: 0, y: 0, width: W, height: H))
g.setFillColor(gray: 1, alpha: 1); g.addLines(between: poly); g.closePath(); g.fillPath()
let cut = CIImage(cgImage: g.makeImage()!)
  .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: max(1.5, fw * 0.01)]).cropped(to: src.extent)
let xs = poly.map(\.x), bottomY = jaw.map(\.y).min()! - fh * 0.04
let crop = CGRect(x: xs.min()!, y: bottomY, width: xs.max()! - xs.min()!, height: top - bottomY).intersection(src.extent)
// a pixel of erosion drops the background halo round the ears
let rawAlpha = mask.applyingFilter("CIMultiplyCompositing", parameters: [kCIInputBackgroundImageKey: cut])
  .applyingFilter("CIMorphologyMinimum", parameters: [kCIInputRadiusKey: max(1, fw * CGFloat(trim))])
  .cropped(to: crop)

/** Only what joins up with the face survives: stray scraps of mask (a bust, a shoulder behind) go. */
func joinedToFace(_ a: CIImage) -> CIImage {
  let e = a.extent.integral
  let w = Int(e.width), h = Int(e.height)
  var px = [UInt8](repeating: 0, count: w * h * 4)
  ctx.render(a, toBitmap: &px, rowBytes: w * 4, bounds: e, format: .RGBA8, colorSpace: nil)
  var keep = [UInt8](repeating: 0, count: w * h)
  // bitmap rows run top-down
  let sx = min(max(Int(fx + fw / 2 - e.minX), 0), w - 1), sy = min(max(Int(e.maxY - (fy + fh / 2)), 0), h - 1)
  var stack = [(sx, sy)]
  while let (x, y) = stack.popLast() {
    let i = y * w + x
    if keep[i] != 0 || px[i * 4] < 20 { continue }
    keep[i] = 255
    if x > 0 { stack.append((x - 1, y)) }
    if x < w - 1 { stack.append((x + 1, y)) }
    if y > 0 { stack.append((x, y - 1)) }
    if y < h - 1 { stack.append((x, y + 1)) }
  }
  let bm = CGContext(data: &keep, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w, space: cs, bitmapInfo: CGImageAlphaInfo.none.rawValue)!
  let joined = CIImage(cgImage: bm.makeImage()!).transformed(by: CGAffineTransform(translationX: e.minX, y: e.minY))
    .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: 2])
    .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1])
  return a.applyingFilter("CIMultiplyCompositing", parameters: [kCIInputBackgroundImageKey: joined]).cropped(to: a.extent)
}
let alpha = joinedToFace(rawAlpha)

func write(_ img: CIImage, _ name: String) {
  let path = "\(outPrefix)-\(name).png"
  try! ctx.writePNGRepresentation(of: img, to: URL(fileURLWithPath: path), format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
  print("wrote", path)
}
func polygonMask(_ pts: [CGPoint], feather: CGFloat) -> CIImage {
  let g = CGContext(data: nil, width: Int(W), height: Int(H), bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.none.rawValue)!
  g.setFillColor(gray: 0, alpha: 1); g.fill(CGRect(x: 0, y: 0, width: W, height: H))
  g.setFillColor(gray: 1, alpha: 1); g.addLines(between: pts); g.closePath(); g.fillPath()
  return CIImage(cgImage: g.makeImage()!).applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: feather]).cropped(to: src.extent)
}
func masked(_ img: CIImage, _ m: CIImage, in r: CGRect) -> CIImage {
  img.cropped(to: r).applyingFilter("CIBlendWithMask", parameters: [
    kCIInputBackgroundImageKey: CIImage(color: .clear).cropped(to: r), kCIInputMaskImageKey: m])
}

// 4. the sticker: the head plus a white outline (its alpha, dilated)
let vivid = src.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 1.08, kCIInputContrastKey: 1.05])
// Wispy edges (hair, mostly) are part background: they take their colour from
// the head just inside them instead, so no wall, curtain or bust shows through.
let spread = masked(vivid, alpha, in: crop).clampedToExtent()
  .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: max(2, fw * 0.025)]).cropped(to: crop)
let inside = spread.applyingFilter("CIUnpremultiply").applyingFilter("CIColorMatrix", parameters: [
  "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0), "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: 1)])
let solid = alpha.applyingFilter("CIColorMatrix", parameters: [
  "inputRVector": CIVector(x: 2.2, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0, y: 2.2, z: 0, w: 0),
  "inputBVector": CIVector(x: 0, y: 0, z: 2.2, w: 0), "inputBiasVector": CIVector(x: -1.1, y: -1.1, z: -1.1, w: 0)])
  .applyingFilter("CIColorClamp")
let clean = vivid.cropped(to: crop).applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: inside, kCIInputMaskImageKey: solid])
let r = max(4, crop.width * 0.03)
let stickerRect = crop.insetBy(dx: -r * 2, dy: -r * 2)
let grown = alpha.applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: r])
  .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1.2]).cropped(to: stickerRect)
let outline = masked(CIImage(color: .white), grown, in: stickerRect)
let sticker = masked(clean, alpha, in: crop).composited(over: outline)

// 5. a cut-out jaw, for talking: below the lip line and inside lines that run
// from the mouth corners down and out past the jaw. It slides down to talk.
guard let lm = lmReq.results?.first?.landmarks, let outer = lm.outerLips, let inner = lm.innerLips else { fatalError("no lips") }
let size = CGSize(width: W, height: H)
let outerPts = outer.pointsInImage(imageSize: size), innerPts = inner.pointsInImage(imageSize: size)
let mL = outerPts.min { $0.x < $1.x }!, mR = outerPts.max { $0.x < $1.x }!
let lipY = innerPts.map(\.y).reduce(0, +) / CGFloat(innerPts.count)
let lipMid = CGPoint(x: innerPts.map(\.x).reduce(0, +) / CGFloat(innerPts.count), y: lipY)
var lipLine: [CGPoint] = []
for k in 0...16 { // quadratic through the corners and the lip centre
  let t = CGFloat(k) / 16
  let a = CGPoint(x: mL.x + (lipMid.x - mL.x) * 2 * t, y: mL.y + (lipMid.y - mL.y) * 2 * t)
  let b = CGPoint(x: lipMid.x + (mR.x - lipMid.x) * (2 * t - 1), y: lipMid.y + (mR.y - lipMid.y) * (2 * t - 1))
  lipLine.append(t <= 0.5 ? a : b)
}
let deep = fh * 0.9
let jawPoly = [CGPoint(x: mL.x - fw * 0.30, y: mL.y - deep)] + lipLine + [CGPoint(x: mR.x + fw * 0.30, y: mR.y - deep)]
let jawMask = polygonMask(jawPoly, feather: max(0.8, fw * 0.004))
let jawPiece = masked(sticker, jawMask, in: stickerRect)
// behind the jaw: a dark mouth, only seen when the jaw drops
let mouthW = (mR.x - mL.x) * 0.5, mouthH = fh * 0.16
let disc = CIFilter.radialGradient()
disc.center = .zero; disc.radius0 = 0.9; disc.radius1 = 1.0
disc.color0 = CIColor(red: 0.27, green: 0.08, blue: 0.09); disc.color1 = CIColor(red: 0.27, green: 0.08, blue: 0.09, alpha: 0)
let lowerHalf = CIImage(color: .white).cropped(to: CGRect(x: -2, y: -2, width: 4, height: 2)) // y ≤ 0
let mouth = disc.outputImage!.cropped(to: CGRect(x: -1, y: -1, width: 2, height: 2))
  .applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: CIImage(color: .clear).cropped(to: CGRect(x: -1, y: -1, width: 2, height: 2)),
                                                  kCIInputMaskImageKey: lowerHalf])
  .transformed(by: CGAffineTransform(scaleX: mouthW, y: mouthH).concatenating(CGAffineTransform(translationX: (mL.x + mR.x) / 2, y: lipY + fh * 0.01)))
let baseLayer = mouth.composited(over: sticker).cropped(to: stickerRect)

// 6. place both layers on one square canvas: chin centred at the bottom
let chin = jaw.min { $0.y < $1.y }!
let S: CGFloat = 288, margin: CGFloat = 4
// the sticker's real bounds (its extent still includes the empty crop above the hair)
func alphaBounds(_ img: CIImage) -> CGRect {
  let e = img.extent.integral
  let w = Int(e.width), h = Int(e.height)
  var px = [UInt8](repeating: 0, count: w * h * 4)
  ctx.render(img, toBitmap: &px, rowBytes: w * 4, bounds: e, format: .RGBA8, colorSpace: nil)
  var minX = w, maxX = -1, minY = h, maxY = -1
  for y in 0..<h { for x in 0..<w where px[(y * w + x) * 4 + 3] > 10 {
    minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
  }}
  // bitmap rows run top-down
  return CGRect(x: e.minX + CGFloat(minX), y: e.maxY - CGFloat(maxY + 1), width: CGFloat(maxX - minX + 1), height: CGFloat(maxY - minY + 1))
}
let bb = alphaBounds(sticker)
let scale = min((S - margin * 2) * 0.99 / bb.height, (S / 2 - margin) / max(chin.x - bb.minX, bb.maxX - chin.x))
let place = CGAffineTransform(translationX: -chin.x, y: -bb.minY).concatenating(CGAffineTransform(scaleX: scale, y: scale))
  .concatenating(CGAffineTransform(translationX: S / 2, y: margin))
let canvas = CGRect(x: 0, y: 0, width: S, height: S)
func onCanvas(_ img: CIImage) -> CIImage { img.transformed(by: place).composited(over: CIImage(color: .clear).cropped(to: canvas)).cropped(to: canvas) }
write(onCanvas(baseLayer), "head")
write(onCanvas(jawPiece), "jaw")
