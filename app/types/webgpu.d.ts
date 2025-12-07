/**
 * WebGPU Type Definitions
 * Minimal types for WebGPU API support
 */

interface GPU {
  requestAdapter(
    options?: GPURequestAdapterOptions,
  ): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): GPUTextureFormat;
}

interface GPURequestAdapterOptions {
  powerPreference?: "low-power" | "high-performance";
}

interface GPUAdapter {
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
  features: Set<string>;
  limits: GPUSupportedLimits;
}

interface GPUDeviceDescriptor {
  requiredFeatures?: string[];
  requiredLimits?: Record<string, number>;
}

interface GPUSupportedLimits {
  maxTextureDimension2D: number;
  maxBufferSize: number;
  maxBindGroups: number;
  maxComputeWorkgroupSizeX: number;
  [key: string]: number;
}

interface GPUDevice extends EventTarget {
  lost: Promise<GPUDeviceLostInfo>;
  destroy(): void;
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createRenderPipeline(
    descriptor: GPURenderPipelineDescriptor,
  ): GPURenderPipeline;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  createCommandEncoder(
    descriptor?: GPUCommandEncoderDescriptor,
  ): GPUCommandEncoder;
  queue: GPUQueue;
}

interface GPUDeviceLostInfo {
  reason: "destroyed" | "unknown";
  message: string;
}

interface GPUBuffer {
  destroy(): void;
}

interface GPUBufferDescriptor {
  label?: string;
  size: number;
  usage: number;
}

interface GPUBufferUsage {
  VERTEX: number;
  INDEX: number;
  UNIFORM: number;
  STORAGE: number;
  COPY_SRC: number;
  COPY_DST: number;
}

declare const GPUBufferUsage: GPUBufferUsage;

interface GPUTexture {
  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
  destroy(): void;
}

interface GPUTextureDescriptor {
  label?: string;
  size: { width: number; height: number; depthOrArrayLayers?: number };
  format: GPUTextureFormat;
  usage: number;
}

interface GPUTextureUsage {
  RENDER_ATTACHMENT: number;
  TEXTURE_BINDING: number;
  COPY_SRC: number;
  COPY_DST: number;
}

declare const GPUTextureUsage: GPUTextureUsage;

type GPUTextureFormat = "bgra8unorm" | "rgba8unorm" | "rgba16float";

interface GPUTextureView {}

interface GPUTextureViewDescriptor {
  format?: GPUTextureFormat;
  dimension?: "2d" | "3d";
}

interface GPUShaderModule {}

interface GPUShaderModuleDescriptor {
  label?: string;
  code: string;
}

interface GPURenderPipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}

interface GPURenderPipelineDescriptor {
  label?: string;
  layout: "auto" | GPUPipelineLayout;
  vertex: GPUVertexState;
  fragment?: GPUFragmentState;
  primitive?: GPUPrimitiveState;
}

interface GPUVertexState {
  module: GPUShaderModule;
  entryPoint: string;
  buffers?: GPUVertexBufferLayout[];
}

interface GPUVertexBufferLayout {
  arrayStride: number;
  attributes: GPUVertexAttribute[];
}

interface GPUVertexAttribute {
  shaderLocation: number;
  offset: number;
  format: string;
}

interface GPUFragmentState {
  module: GPUShaderModule;
  entryPoint: string;
  targets: GPUColorTargetState[];
}

interface GPUColorTargetState {
  format: GPUTextureFormat;
  blend?: GPUBlendState;
}

interface GPUBlendState {
  color: GPUBlendComponent;
  alpha: GPUBlendComponent;
}

interface GPUBlendComponent {
  srcFactor: string;
  dstFactor: string;
  operation: string;
}

interface GPUPrimitiveState {
  topology: "point-list" | "line-list" | "triangle-list" | "triangle-strip";
}

interface GPUPipelineLayout {}

interface GPUBindGroupLayout {}

interface GPUBindGroup {}

interface GPUBindGroupDescriptor {
  label?: string;
  layout: GPUBindGroupLayout;
  entries: GPUBindGroupEntry[];
}

interface GPUBindGroupEntry {
  binding: number;
  resource: GPUTextureView | GPUSampler;
}

interface GPUSampler {}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
  finish(): GPUCommandBuffer;
}

interface GPUCommandEncoderDescriptor {
  label?: string;
}

interface GPURenderPassDescriptor {
  label?: string;
  colorAttachments: (GPURenderPassColorAttachment | null)[];
}

interface GPURenderPassColorAttachment {
  view: GPUTextureView;
  loadOp: "load" | "clear";
  storeOp: "store" | "discard";
  clearValue?: { r: number; g: number; b: number; a: number };
}

interface GPURenderPassEncoder {
  setPipeline(pipeline: GPURenderPipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  setVertexBuffer(slot: number, buffer: GPUBuffer): void;
  draw(vertexCount: number, instanceCount?: number): void;
  end(): void;
}

interface GPUCommandBuffer {}

interface GPUQueue {
  submit(commandBuffers: GPUCommandBuffer[]): void;
  writeBuffer(
    buffer: GPUBuffer,
    bufferOffset: number,
    data: ArrayBuffer | ArrayBufferView,
    dataOffset?: number,
    size?: number,
  ): void;
}

interface GPUCanvasContext {
  configure(configuration: GPUCanvasConfiguration): void;
  getCurrentTexture(): GPUTexture;
}

interface GPUCanvasConfiguration {
  device: GPUDevice;
  format: GPUTextureFormat;
  alphaMode?: "opaque" | "premultiplied";
  usage?: number;
}

// Extend Navigator interface
interface Navigator {
  readonly gpu?: GPU;
}

// Extend HTMLCanvasElement
interface HTMLCanvasElement {
  getContext(contextId: "webgpu"): GPUCanvasContext | null;
}
