import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentDrawer from '@/components/mongo/DocumentDrawer';

describe('DocumentDrawer', () => {
  it('resyncs edit textarea when selected document changes', async () => {
    const noop = () => {};
    const firstDoc = { _id: 'a1', name: 'first' };
    const secondDoc = { _id: 'b2', name: 'second' };

    const { rerender } = render(
      <DocumentDrawer document={firstDoc} mode="edit" onClose={noop} onSave={noop} onDelete={noop} onEdit={noop} />
    );

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue(JSON.stringify(firstDoc, null, 2));

    fireEvent.change(textarea, { target: { value: '{"_id":"a1","name":"edited"}' } });

    rerender(
      <DocumentDrawer document={secondDoc} mode="edit" onClose={noop} onSave={noop} onDelete={noop} onEdit={noop} />
    );

    expect(screen.getByRole('textbox')).toHaveValue(JSON.stringify(secondDoc, null, 2));
  });
});
