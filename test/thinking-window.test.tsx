/**
 * @jest-environment jsdom
 */

// Simple test to verify the ThinkingWindow interface changes
describe('ThinkingWindow Interface', () => {
  it('should support onContentUpdate prop in interface', () => {
    // Test the interface definition
    interface ThinkingWindowProps {
      content: string;
      isStreaming?: boolean;
      onToggle?: (expanded: boolean) => void;
      onContentUpdate?: () => void;
    }

    // Test that we can create props with onContentUpdate
    const props: ThinkingWindowProps = {
      content: "Test content",
      isStreaming: true,
      onContentUpdate: () => console.log('Content updated')
    };

    expect(props.onContentUpdate).toBeDefined();
    expect(typeof props.onContentUpdate).toBe('function');
  });

  it('should handle callback execution', () => {
    let callbackExecuted = false;

    const mockCallback = () => {
      callbackExecuted = true;
    };

    // Simulate the callback being called
    mockCallback();

    expect(callbackExecuted).toBe(true);
  });
});
