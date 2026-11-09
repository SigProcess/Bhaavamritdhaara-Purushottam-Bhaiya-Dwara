#!/usr/bin/env swift
//
// Rewrites a PNG with no alpha channel, compositing any transparency over opaque white.
// App Store Connect rejects screenshots that contain an alpha channel or transparency.
//
// Uses only CoreGraphics/ImageIO from the Xcode toolchain, so CI needs no ImageMagick,
// Pillow, or other third-party image tooling.
//
// Usage: swift scripts/flatten-png.swift <input.png> <output.png>
// Prints: "<width>x<height> colourComponents=<n> alpha=none"

import CoreGraphics
import Foundation
import ImageIO

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("flatten-png: \(message)\n".utf8))
    exit(1)
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else { fail("usage: flatten-png.swift <input.png> <output.png>") }
let inputURL = URL(fileURLWithPath: arguments[1])
let outputURL = URL(fileURLWithPath: arguments[2])

guard let source = CGImageSourceCreateWithURL(inputURL as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
else { fail("could not decode \(inputURL.path)") }

let width = image.width
let height = image.height
guard width > 0, height > 0 else { fail("degenerate image size \(width)x\(height)") }

guard let space = CGColorSpace(name: CGColorSpace.sRGB),
      let context = CGContext(
          data: nil,
          width: width,
          height: height,
          bitsPerComponent: 8,
          bytesPerRow: 0,
          space: space,
          bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
      )
else { fail("could not create an opaque RGB context") }

let rect = CGRect(x: 0, y: 0, width: width, height: height)
context.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
context.fill(rect)
context.draw(image, in: rect)

guard let flattened = context.makeImage() else { fail("could not render the flattened image") }
guard let destination = CGImageDestinationCreateWithURL(outputURL as CFURL, "public.png" as CFString, 1, nil)
else { fail("could not create \(outputURL.path)") }
CGImageDestinationAddImage(destination, flattened, nil)
guard CGImageDestinationFinalize(destination) else { fail("could not write \(outputURL.path)") }

print("\(width)x\(height) colourComponents=\(flattened.colorSpace?.numberOfComponents ?? 0) alpha=none")
