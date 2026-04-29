import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollectionTab from '@/components/mongo/CollectionTab';
import { MongoApi } from '@/lib/mongo-api';

vi.mock('@/lib/mongo-api', () => ({
  MongoApi: {
    findDocuments: vi.fn(),
    updateDocument: vi.fn(),
    insertDocument: vi.fn(),
    deleteDocument: vi.fn(),
    executeAggregate: vi.fn(),
    executeShellCommand: vi.fn(),
    getLlmSettings: vi.fn(),
    saveLlmSettings: vi.fn(),
    generateShellQuery: vi.fn(),
  },
}));

describe('CollectionTab edit flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the originally selected document id even when edited json changes _id', async () => {
    MongoApi.findDocuments.mockResolvedValue({
      documents: [{ _id: 'orig-1', name: 'Alpha' }],
      total: 1,
      executionTime: 2,
    });
    MongoApi.updateDocument.mockResolvedValue({ _id: 'orig-1', name: 'Changed' });

    render(<CollectionTab connectionId="c1" database="db1" collection="users" />);

    await waitFor(() => expect(MongoApi.findDocuments).toHaveBeenCalled());

    const cell = await screen.findByText('Alpha');
    await userEvent.click(cell);

    await userEvent.click(screen.getByTitle('Edit'));

    const dialog = screen.getByText('Edit Document').closest('div.fixed');
    const textarea = within(dialog).getByRole('textbox');
    fireEvent.change(textarea, {
      target: { value: JSON.stringify({ _id: 'hijacked', name: 'Changed' }, null, 2) },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const confirmDialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(confirmDialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(MongoApi.updateDocument).toHaveBeenCalledWith(
        'c1',
        'db1',
        'users',
        'orig-1',
        { _id: 'hijacked', name: 'Changed' }
      );
    });
  });
});
