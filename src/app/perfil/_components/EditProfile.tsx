'use client';

import { startTransition, useActionState, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Avatar, Button, Cover, Icon, IconButton, Modal, TextArea, TextField } from 'nogasds';
import { messages } from '@/lib/auth/messages';
import { checkName, usernameError } from '@/lib/auth/validation';
import { IMAGE_ACCEPT, IMAGE_MAX_BYTES, type ProfileImageKind as ImageKind } from '@/lib/profile/images';
import { profileMessages } from '@/lib/profile/messages';
import { updateProfileAction } from '../actions';
import { initialEditProfileState, type EditProfileState } from '../state';
import styles from '../profile.module.css';
import { uploadImage, type UploadMode } from './upload-image';

const BIO_MAX = 160;
const FORM_ID = 'edit-profile-form';

export interface EditProfileProps {
  name: string;
  username: string;
  bio: string;
  avatarUrl?: string;
  coverUrl?: string;
  /** Enquadramento vertical da capa já salvo (0 a 100). */
  coverPosition: number;
  /** Mensagem com a data em que o nome volta a poder ser trocado (nome travado), ou `undefined` se já pode. */
  nameLocked?: string;
  usernameLocked?: string;
  /** Quem está editando (as imagens vão para a pasta dele no Blob). */
  userId: string;
  /** Onde as imagens são guardadas neste ambiente. */
  uploadMode: UploadMode;
}

type Confirming = ImageKind | null;

/** Botão "Editar perfil" e o modal de edição (Figma: Perfil / Editar perfil). */
export function EditProfile(props: EditProfileProps) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialEditProfileState({ name: props.name, username: props.username, bio: props.bio }),
  );

  return (
    <>
      <Button variant="outline" leadingIcon={<Icon name="edit" />} onClick={() => setOpen(true)}>
        {profileMessages.edit}
      </Button>
      {/* `key`: ao fechar, o formulário é recriado e volta aos valores salvos. */}
      <EditForm
        key={session}
        {...props}
        open={open}
        onClose={() => {
          setOpen(false);
          setSession((value) => value + 1);
        }}
        state={state}
        pending={pending}
        submit={(data) => startTransition(() => formAction(data))}
      />
    </>
  );
}

interface EditFormProps extends EditProfileProps {
  open: boolean;
  onClose: () => void;
  state: EditProfileState;
  pending: boolean;
  submit: (data: FormData) => void;
}

function EditForm({
  open,
  onClose,
  state,
  pending,
  submit,
  name,
  username,
  avatarUrl,
  coverUrl,
  coverPosition,
  nameLocked,
  usernameLocked,
  userId,
  uploadMode,
}: EditFormProps) {
  const [uploading, setUploading] = useState(false);
  const canUpload = uploadMode !== 'unavailable';
  const [bioText, setBioText] = useState(state.values.bio);
  const [preview, setPreview] = useState<Record<ImageKind, string | null>>({ avatar: null, cover: null });
  const [removed, setRemoved] = useState<Record<ImageKind, boolean>>({ avatar: false, cover: false });
  const [fileErrors, setFileErrors] = useState<Partial<Record<ImageKind, string>>>({});
  const [liveErrors, setLiveErrors] = useState<{ name?: string; username?: string }>({});
  const [confirming, setConfirming] = useState<Confirming>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  // Libera as prévias (endereços temporários do navegador) ao trocar de imagem ou fechar.
  useEffect(() => {
    const url = preview.avatar;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview.avatar]);
  useEffect(() => {
    const url = preview.cover;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview.cover]);

  const bioCount = bioText.length;
  const bioTooLong = bioCount > BIO_MAX;
  const shownAvatar = removed.avatar ? undefined : (preview.avatar ?? avatarUrl);
  const shownCover = removed.cover ? undefined : (preview.cover ?? coverUrl);

  // Enquadramento da capa: arrastar a imagem na vertical (ou usar os botões). Guarda só a posição, de 0 (topo) a 100 (base).
  const [position, setPosition] = useState(coverPosition);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const coverBox = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ startY: number; startPosition: number; overflow: number } | null>(null);
  useEffect(() => {
    if (!shownCover) return;
    const image = new Image();
    image.onload = () => setNatural({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = shownCover;
    return () => {
      image.onload = null;
    };
  }, [shownCover]);
  const clampPosition = (value: number) => Math.min(100, Math.max(0, Math.round(value)));
  /** Quanto da imagem sobra para cima e para baixo da faixa visível, em pixels (a imagem preenche a faixa). */
  const overflowPx = () => {
    const box = coverBox.current;
    if (!box || !natural) return 0;
    const scale = Math.max(box.clientWidth / natural.width, box.clientHeight / natural.height);
    return Math.max(0, natural.height * scale - box.clientHeight);
  };
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId); // o arrastar continua mesmo com o dedo fora da faixa
    } catch {
      // sem captura (ponteiro já encerrado): o arrastar segue só dentro da faixa
    }
    dragging.current = { startY: event.clientY, startPosition: position, overflow: overflowPx() };
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragging.current;
    if (!drag || drag.overflow <= 0) return;
    // Puxar a imagem para baixo mostra mais o topo (posição menor).
    setPosition(clampPosition(drag.startPosition - ((event.clientY - drag.startY) / drag.overflow) * 100));
  };
  const endDrag = () => {
    dragging.current = null;
  };

  const pick = (kind: ImageKind, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const accepted = IMAGE_ACCEPT.split(',').includes(file.type);
    const error = !accepted
      ? profileMessages.imageType
      : file.size > IMAGE_MAX_BYTES[kind]
        ? kind === 'avatar'
          ? profileMessages.avatarTooBig
          : profileMessages.coverTooBig
        : undefined;
    setFileErrors((previous) => ({ ...previous, [kind]: error }));
    if (error) {
      event.target.value = '';
      return;
    }
    setPreview((previous) => ({ ...previous, [kind]: URL.createObjectURL(file) }));
    setRemoved((previous) => ({ ...previous, [kind]: false }));
    if (kind === 'cover') setPosition(50); // imagem nova: começa no centro
  };

  const remove = (kind: ImageKind) => {
    const input = kind === 'avatar' ? avatarInput.current : coverInput.current;
    if (input) input.value = '';
    setPreview((previous) => ({ ...previous, [kind]: null }));
    setRemoved((previous) => ({ ...previous, [kind]: true }));
    if (kind === 'cover') setPosition(50);
    setFileErrors((previous) => ({ ...previous, [kind]: undefined }));
    setConfirming(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // não deixar o React limpar o formulário (e os arquivos escolhidos) depois de um erro
    const data = new FormData(event.currentTarget);
    // Os arquivos não vão na ação (o limite de 4,5 MB das funções da Vercel): sobem antes, e a ação recebe só a referência.
    data.delete('avatar');
    data.delete('cover');
    setUploading(true);
    for (const kind of ['avatar', 'cover'] as const) {
      const file = (kind === 'avatar' ? avatarInput : coverInput).current?.files?.[0];
      if (!file) continue;
      try {
        data.set(kind === 'avatar' ? 'avatarRef' : 'coverRef', await uploadImage(uploadMode, kind, file, userId));
      } catch {
        setFileErrors((previous) => ({ ...previous, [kind]: profileMessages.uploadFailed }));
        setUploading(false);
        return;
      }
    }
    setUploading(false);
    submit(data);
  };

  /** Erro ao sair do campo, com as mesmas regras do cadastro. Campo travado ou igual ao atual não é conferido. */
  const handleBlur = (field: 'name' | 'username', value: string) => {
    let error: string | undefined;
    if (field === 'name' && value.trim() !== name) {
      const problem = checkName(value);
      const m = messages.signup;
      error = { required: m.nameRequired, long: m.nameLong, chars: m.nameChars, names: m.nameNames, short: m.nameShort }[problem ?? 'required'];
      if (problem === null) error = undefined;
    }
    if (field === 'username' && value !== username) error = usernameError(value);
    setLiveErrors((previous) => ({ ...previous, [field]: error }));
  };

  const errors = state.errors;
  const nameError = liveErrors.name ?? errors.name;
  const usernameErr = liveErrors.username ?? errors.username;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={profileMessages.title}
        closeLabel="Fechar"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              {profileMessages.cancel}
            </Button>
            <Button type="submit" form={FORM_ID} disabled={pending || uploading || bioTooLong}>
              {uploading ? profileMessages.uploading : profileMessages.save}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} className={styles.editForm} onSubmit={onSubmit} noValidate>
          {errors.form ? (
            <p className={styles.fieldError} role="alert">
              {errors.form}
            </p>
          ) : null}

          <fieldset className={styles.group}>
            <legend className={styles.groupLabel}>{profileMessages.cover}</legend>
            {/* Arrastar a imagem na vertical muda o enquadramento; nos botões, o mesmo em passos de 5. */}
            <div
              ref={coverBox}
              className={shownCover ? styles.coverDrag : undefined}
              onPointerDown={shownCover ? startDrag : undefined}
              onPointerMove={shownCover ? moveDrag : undefined}
              onPointerUp={shownCover ? endDrag : undefined}
              onPointerCancel={shownCover ? endDrag : undefined}
            >
              <Cover className={styles.coverPreview} src={shownCover} positionY={position} placeholder={!shownCover && Boolean(coverUrl || preview.cover)} />
            </div>
            {shownCover ? (
              <div className={styles.pickRow}>
                <IconButton icon="keyboard-arrow-up" label={`${profileMessages.coverPositionLabel}: ${profileMessages.coverPositionTop}`} variant="outline" size="sm" onClick={() => setPosition((value) => clampPosition(value - 5))} disabled={position <= 0} />
                <IconButton icon="keyboard-arrow-down" label={`${profileMessages.coverPositionLabel}: ${profileMessages.coverPositionBottom}`} variant="outline" size="sm" onClick={() => setPosition((value) => clampPosition(value + 5))} disabled={position >= 100} />
                <p className={styles.hint}>{profileMessages.coverPositionHint}</p>
              </div>
            ) : null}
            {shownCover ? <input type="hidden" name="coverPosition" value={position} /> : null}
            <div className={styles.pickRow}>
              <Button type="button" variant="outline" size="sm" disabled={!canUpload} onClick={() => coverInput.current?.click()}>
                {profileMessages.changeCover}
              </Button>
              {shownCover ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming('cover')}>
                  {profileMessages.removeCover}
                </Button>
              ) : null}
            </div>
            <p className={styles.hint}>{canUpload ? profileMessages.coverHint : profileMessages.uploadUnavailable}</p>
            <input ref={coverInput} className={styles.hidden} type="file" name="cover" accept={IMAGE_ACCEPT} onChange={(event) => pick('cover', event)} tabIndex={-1} aria-label={profileMessages.changeCover} />
            {removed.cover ? <input type="hidden" name="removeCover" value="1" /> : null}
            {fileErrors.cover ?? errors.cover ? (
              <p className={styles.fieldError} role="alert">
                {fileErrors.cover ?? errors.cover}
              </p>
            ) : null}
          </fieldset>

          <fieldset className={styles.group}>
            <legend className={styles.groupLabel}>{profileMessages.avatar}</legend>
            <div className={styles.pickRow}>
              <Avatar name={name} src={shownAvatar} size="lg" />
              <Button type="button" variant="outline" size="sm" disabled={!canUpload} onClick={() => avatarInput.current?.click()}>
                {profileMessages.changePhoto}
              </Button>
              {shownAvatar ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming('avatar')}>
                  {profileMessages.removePhoto}
                </Button>
              ) : null}
            </div>
            <p className={styles.hint}>{canUpload ? profileMessages.avatarHint : profileMessages.uploadUnavailable}</p>
            <input ref={avatarInput} className={styles.hidden} type="file" name="avatar" accept={IMAGE_ACCEPT} onChange={(event) => pick('avatar', event)} tabIndex={-1} aria-label={profileMessages.changePhoto} />
            {removed.avatar ? <input type="hidden" name="removeAvatar" value="1" /> : null}
            {fileErrors.avatar ?? errors.avatar ? (
              <p className={styles.fieldError} role="alert">
                {fileErrors.avatar ?? errors.avatar}
              </p>
            ) : null}
          </fieldset>

          {nameLocked ? <input type="hidden" name="name" value={name} /> : null}
          <TextField
            label={profileMessages.nameLabel}
            name={nameLocked ? undefined : 'name'}
            defaultValue={state.values.name}
            autoComplete="name"
            disabled={Boolean(nameLocked)}
            helpText={nameLocked ?? profileMessages.nameHint}
            error={nameError}
            onBlur={(event) => handleBlur('name', event.target.value)}
          />
          {usernameLocked ? <input type="hidden" name="username" value={username} /> : null}
          <TextField
            label={profileMessages.usernameLabel}
            name={usernameLocked ? undefined : 'username'}
            defaultValue={state.values.username}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={Boolean(usernameLocked)}
            helpText={usernameLocked ?? profileMessages.usernameHint}
            error={usernameErr}
            onBlur={(event) => handleBlur('username', event.target.value)}
          />
          <TextArea
            label={profileMessages.bioLabel}
            name="bio"
            value={bioText}
            onChange={(event) => setBioText(event.target.value)}
            rows={4}
            helpText={profileMessages.bioCounter(bioCount)}
            error={bioTooLong ? profileMessages.bioTooLong(bioCount) : errors.bio}
          />
        </form>
      </Modal>

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming === 'cover' ? profileMessages.removeCoverTitle : profileMessages.removePhotoTitle}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              {profileMessages.cancel}
            </Button>
            <Button onClick={() => confirming && remove(confirming)}>{profileMessages.remove}</Button>
          </>
        }
      >
        <p className={styles.confirmText}>{confirming === 'cover' ? profileMessages.removeCoverText : profileMessages.removePhotoText}</p>
      </Modal>
    </>
  );
}
